import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'
import { guildService, type GuildRoleManage } from './GuildService'
import {
    reactionRolesService,
    type ReactionRoleMappingReturn,
} from '@lucky/shared/services/ReactionRolesService'
import { infoLog, errorLog } from '@lucky/shared/utils/general/log'
import { AppError } from '../errors/AppError'

export interface StyleTemplate {
    color?: string | null // hex '0x5865F2'
    hoist?: boolean
    mentionable?: boolean
    buttonStyle?: string | null // 'Primary' | 'Secondary' | 'Success' | 'Danger'
}

export interface AddRoleToGroupRequest {
    name: string
    label?: string
    emoji?: string
    colorOverride?: string // hex '0xRRGGBB'
    dryRun?: boolean
}

export interface AddRoleToGroupPlan {
    roleName: string
    resolvedColorHex: string | null
    resolvedColorInt: number | undefined
    buttonStyle: string
    willCreateRole: boolean
    willAddButton: boolean
}

export interface AddRoleToGroupResult {
    status: 'ok' | 'partial_success'
    role: GuildRoleManage
    mapping: ReactionRoleMappingReturn
}

export class RoleGroupService {
    private prisma = getPrismaClient()

    /**
     * Converts hex color string to integer.
     * '0x5865F2' -> 5793266
     */
    hexToInt(hex: string | null | undefined): number | undefined {
        if (!hex) return undefined
        try {
            return parseInt(hex, 16)
        } catch {
            return undefined
        }
    }

    /**
     * Converts integer color to hex string.
     * 5793266 -> '0x5865F2'
     */
    intToHex(color: number | null | undefined): string | undefined {
        if (color === null || color === undefined) return undefined
        return '0x' + color.toString(16).padStart(6, '0').toUpperCase()
    }

    /**
     * Seed style from an existing reaction-role message's sibling roles.
     * Returns modal color, mode buttonStyle (tie -> Primary), and divergence flag.
     */
    // eslint-disable-next-line complexity
    async seedStyleFromMessage(messageId: string): Promise<
        StyleTemplate & {
            buttonStyle: string
            divergence: boolean
        }
    > {
        const message = await this.prisma.reactionRoleMessage.findUnique({
            where: { id: messageId },
        })
        if (!message) {
            throw AppError.notFound(`Message ${messageId} not found`)
        }

        const mappings = await this.prisma.reactionRoleMapping.findMany({
            where: { messageId },
        })

        // Get all roles for the guild
        const allRoles = await guildService.getFullGuildRoles(message.guildId)

        // Filter to only the roles mapped in this message
        const mappedRoleIds = new Set(mappings.map((m) => m.roleId))
        const siblingRoles = allRoles.filter((r) => mappedRoleIds.has(r.id))

        // Modal (most common) color
        const colorCounts = new Map<number, number>()
        for (const role of siblingRoles) {
            const count = colorCounts.get(role.color) ?? 0
            colorCounts.set(role.color, count + 1)
        }
        let modalColor: number | undefined
        let modalColorCount = 0
        for (const [color, count] of colorCounts.entries()) {
            if (count > modalColorCount) {
                modalColor = color
                modalColorCount = count
            }
        }
        const colorHex =
            modalColor !== undefined ? this.intToHex(modalColor) : null

        // Modal hoist and mentionable
        const hoistCounts = new Map<boolean, number>()
        const mentionableCounts = new Map<boolean, number>()
        for (const role of siblingRoles) {
            const hc = hoistCounts.get(role.hoist) ?? 0
            hoistCounts.set(role.hoist, hc + 1)
            const mc = mentionableCounts.get(role.mentionable) ?? 0
            mentionableCounts.set(role.mentionable, mc + 1)
        }
        const modalHoist =
            (hoistCounts.get(true) ?? 0) > (hoistCounts.get(false) ?? 0)
        const modalMentionable =
            (mentionableCounts.get(true) ?? 0) >
            (mentionableCounts.get(false) ?? 0)

        // Mode (most common) buttonStyle; tie -> Primary
        const styleCounts = new Map<string, number>()
        for (const mapping of mappings) {
            const style = mapping.style ?? 'Primary'
            const count = styleCounts.get(style) ?? 0
            styleCounts.set(style, count + 1)
        }
        // Find the maximum count
        let maxCount = 0
        for (const count of styleCounts.values()) {
            if (count > maxCount) maxCount = count
        }
        // Count how many styles have the max count
        let maxCountStyles = 0
        let maxNonPrimaryStyle = ''
        const primaryCount = styleCounts.get('Primary') ?? 0
        for (const [style, count] of styleCounts.entries()) {
            if (count === maxCount) {
                maxCountStyles++
                if (style !== 'Primary') {
                    maxNonPrimaryStyle = style
                }
            }
        }
        // Decision: if Primary is at max OR there's a tie OR no mappings, use Primary
        const modeStyle =
            primaryCount === maxCount || maxCountStyles > 1 || maxCount === 0
                ? 'Primary'
                : maxNonPrimaryStyle

        // Divergence: colors differ OR hoist differs OR mentionable differs
        const divergence =
            colorCounts.size > 1 ||
            hoistCounts.size > 1 ||
            mentionableCounts.size > 1

        return {
            color: colorHex,
            hoist: modalHoist,
            mentionable: modalMentionable,
            buttonStyle: modeStyle as
                | 'Primary'
                | 'Secondary'
                | 'Success'
                | 'Danger',
            divergence,
        }
    }

    /**
     * Create a new role group.
     * If fromMessageId: seed style from the message's sibling roles and link.
     * Else: use the provided style.
     */
    async createRoleGroup(req: {
        guildId: string
        name: string
        fromMessageId?: string
        style?: StyleTemplate
    }) {
        let style: StyleTemplate

        if (req.fromMessageId) {
            // Check if the message already has a groupId (1:1 constraint)
            const message = await this.prisma.reactionRoleMessage.findUnique({
                where: { id: req.fromMessageId },
            })
            if (!message) {
                throw AppError.notFound(
                    `Message ${req.fromMessageId} not found`,
                )
            }
            // Verify message belongs to the guild (IDOR protection)
            if (message.guildId !== req.guildId) {
                throw AppError.notFound(
                    `Message ${req.fromMessageId} not found`,
                )
            }
            if (message.groupId) {
                throw AppError.conflict(
                    `Message already has a group; conflict due to 1:1 constraint`,
                )
            }

            style = await this.seedStyleFromMessage(req.fromMessageId)
        } else {
            style = req.style ?? {}
        }

        // If seeded from message, wrap in transaction to link atomically
        if (req.fromMessageId) {
            const result = await this.prisma.$transaction(async (tx) => {
                const newGroup = await tx.roleGroup.create({
                    data: {
                        guildId: req.guildId,
                        name: req.name,
                        color: style.color,
                        hoist: style.hoist ?? false,
                        mentionable: style.mentionable ?? false,
                        buttonStyle: style.buttonStyle,
                    },
                })

                // Conditional update: only link if message still has groupId = null
                const linked = await tx.reactionRoleMessage.updateMany({
                    where: {
                        id: req.fromMessageId,
                        groupId: null,
                    },
                    data: { groupId: newGroup.id },
                })

                if (linked.count === 0) {
                    throw AppError.conflict(
                        `Message already has a group; conflict during transaction link`,
                    )
                }

                return newGroup
            })
            return result
        } else {
            return await this.prisma.roleGroup.create({
                data: {
                    guildId: req.guildId,
                    name: req.name,
                    color: style.color,
                    hoist: style.hoist ?? false,
                    mentionable: style.mentionable ?? false,
                    buttonStyle: style.buttonStyle,
                },
            })
        }
    }

    /**
     * Add a role to a group with preflight checks, dry-run support, DB-first apply,
     * and role-only compensation on failure.
     */
    // eslint-disable-next-line complexity
    async addRoleToGroup(
        guildId: string,
        groupId: string,
        req: AddRoleToGroupRequest,
        botToken: string,
    ): Promise<{
        plan?: AddRoleToGroupPlan
        status?: 'ok' | 'partial_success'
        role?: GuildRoleManage
        mapping?: ReactionRoleMappingReturn
    }> {
        // Load group and verify it belongs to the guild (IDOR protection)
        const group = await this.prisma.roleGroup.findFirst({
            where: { id: groupId, guildId },
        })
        if (!group) {
            throw AppError.notFound(`Group ${groupId} not found`)
        }

        // Load the linked message
        const message = await this.prisma.reactionRoleMessage.findUnique({
            where: { groupId },
        })
        if (!message) {
            throw AppError.notFound(`No message linked to group ${groupId}`)
        }

        // Load current mappings for this message
        const currentMappings = await this.prisma.reactionRoleMapping.findMany({
            where: { messageId: message.id },
        })

        // Preflight checks (no mutations)
        // 1. Message button count < 25
        if (currentMappings.length >= 25) {
            throw AppError.conflict(
                `Cannot add role: message has 25 buttons (Discord limit reached)`,
            )
        }

        // 2. Guild role count < 250
        const allGuildRoles = await guildService.getFullGuildRoles(
            group.guildId,
        )
        if (allGuildRoles.length >= 250) {
            throw AppError.conflict(
                `Cannot add role: guild has 250 roles (Discord limit)`,
            )
        }

        // 3. Label length <= 80
        const label = req.label ?? req.name
        if (label.length > 80) {
            throw AppError.badRequest(
                `Label too long (${label.length} chars, max 80)`,
            )
        }

        // 4. Role name not already mapped in this message
        const mappedRoleIds = new Set(currentMappings.map((m) => m.roleId))
        const existingRolesInMessage = allGuildRoles.filter((r) =>
            mappedRoleIds.has(r.id),
        )
        if (
            existingRolesInMessage.some(
                (r) => r.name.toLowerCase() === req.name.toLowerCase(),
            )
        ) {
            throw AppError.conflict(
                `A role named "${req.name}" is already mapped in this message (double-submit guard)`,
            )
        }

        // Resolve style
        const resolvedColorHex = req.colorOverride ?? group.color
        const resolvedColorInt = this.hexToInt(resolvedColorHex)
        const resolvedButtonStyle = (group.buttonStyle ?? 'Primary') as
            | 'Primary'
            | 'Secondary'
            | 'Success'
            | 'Danger'

        // Build plan
        const plan: AddRoleToGroupPlan = {
            roleName: req.name,
            resolvedColorHex: resolvedColorHex ?? null,
            resolvedColorInt,
            buttonStyle: resolvedButtonStyle,
            willCreateRole: true,
            willAddButton: true,
        }

        if (req.dryRun) {
            return { plan }
        }

        // Apply: create role + add button
        let createdRole: GuildRoleManage
        try {
            createdRole = await guildService.createGuildRole(group.guildId, {
                name: req.name,
                color: resolvedColorInt,
                hoist: group.hoist,
                mentionable: group.mentionable,
                permissions: '0', // no permissions
            })
        } catch (error) {
            errorLog({
                message: `Failed to create role "${req.name}" for group ${groupId}`,
                error,
            })
            throw error
        }

        // Add to message (DB-first)
        let addResult: {
            status: 'ok' | 'partial_success'
            mapping: ReactionRoleMappingReturn
        }
        try {
            addResult = await reactionRolesService.addRoleToMessage(
                message.messageId,
                {
                    roleId: createdRole.id,
                    label: label,
                    emoji: req.emoji,
                    style: resolvedButtonStyle,
                },
                botToken,
            )
        } catch (error) {
            // Compensation: delete the created role (404-tolerant)
            errorLog({
                message: `Failed to add role to message; compensating by deleting role ${createdRole.id}`,
                error,
            })
            try {
                await guildService.deleteGuildRole(
                    group.guildId,
                    createdRole.id,
                )
            } catch (deleteError) {
                errorLog({
                    message: `Compensation delete also failed (404 is acceptable)`,
                    error: deleteError,
                })
            }
            throw error
        }

        // Handle partial_success
        if (addResult.status === 'partial_success') {
            infoLog({
                message: `Added role to group ${groupId} but Discord PATCH failed; data is consistent, visuals will re-sync (roleId: ${createdRole.id}, messageId: ${message.id})`,
            })
        }

        return {
            status: addResult.status,
            role: createdRole,
            mapping: addResult.mapping,
        }
    }

    /**
     * List all role groups for a guild.
     */
    async listRoleGroups(guildId: string) {
        return this.prisma.roleGroup.findMany({
            where: { guildId },
            orderBy: { createdAt: 'desc' },
        })
    }

    /**
     * Get a role group by ID and guild ID.
     */
    async getRoleGroup(id: string, guildId: string) {
        return this.prisma.roleGroup.findFirst({
            where: { id, guildId },
        })
    }

    /**
     * Update a role group's style template.
     */
    async updateRoleGroup(
        id: string,
        guildId: string,
        updates: {
            color?: string | null
            hoist?: boolean
            mentionable?: boolean
            buttonStyle?: string | null
        },
    ) {
        const group = await this.getRoleGroup(id, guildId)
        if (!group) return null

        return this.prisma.roleGroup.update({
            where: { id },
            data: {
                ...(updates.color !== undefined && { color: updates.color }),
                ...(updates.hoist !== undefined && { hoist: updates.hoist }),
                ...(updates.mentionable !== undefined && {
                    mentionable: updates.mentionable,
                }),
                ...(updates.buttonStyle !== undefined && {
                    buttonStyle: updates.buttonStyle,
                }),
            },
        })
    }

    /**
     * Detach a role from a group's message (remove mapping, keep Discord role).
     */
    async detachRoleFromGroup(
        groupId: string,
        roleId: string,
        guildId: string,
    ): Promise<boolean> {
        // Verify group exists and belongs to guild
        const group = await this.getRoleGroup(groupId, guildId)
        if (!group) return false

        // Load the linked message
        const message = await this.prisma.reactionRoleMessage.findUnique({
            where: { groupId },
        })
        if (!message) return false

        // Delete the mapping
        const deleted = await this.prisma.reactionRoleMapping.deleteMany({
            where: {
                messageId: message.id,
                roleId,
            },
        })

        // Return true if at least one mapping was deleted
        return deleted.count > 0
    }
}

export const roleGroupService = new RoleGroupService()
