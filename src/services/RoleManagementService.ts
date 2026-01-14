import type { GuildMember, PartialGuildMember } from 'discord.js'
import { errorLog, debugLog } from '../utils/general/log'
import { featureToggleService } from './FeatureToggleService'
import { getPrismaClient } from '../utils/database/prismaClient'

const prisma = getPrismaClient()

export class RoleManagementService {
    async isEnabled(guildId?: string, userId?: string): Promise<boolean> {
        return featureToggleService.isEnabled('ROLE_MANAGEMENT', {
            guildId,
            userId,
        })
    }

    async setExclusiveRole(
        guildId: string,
        roleId: string,
        excludedRoleId: string,
    ): Promise<boolean> {
        try {
            await (prisma.roleExclusion.upsert as (args: unknown) => Promise<unknown>)({
                where: {
                    guildId_roleId_excludedRoleId: {
                        guildId,
                        roleId,
                        excludedRoleId,
                    },
                },
                create: {
                    guildId,
                    roleId,
                    excludedRoleId,
                },
                update: {},
            })

            debugLog({
                message: `Set exclusive role: ${roleId} excludes ${excludedRoleId} in guild ${guildId}`,
            })

            return true
        } catch (error) {
            errorLog({
                message: 'Failed to set exclusive role:',
                error,
            })
            return false
        }
    }

    async removeExclusiveRole(
        guildId: string,
        roleId: string,
        excludedRoleId: string,
    ): Promise<boolean> {
        try {
            await (prisma.roleExclusion.deleteMany as (args: unknown) => Promise<unknown>)({
                where: {
                    guildId,
                    roleId,
                    excludedRoleId,
                },
            })

            debugLog({
                message: `Removed exclusive role: ${roleId} excludes ${excludedRoleId} in guild ${guildId}`,
            })

            return true
        } catch (error) {
            errorLog({
                message: 'Failed to remove exclusive role:',
                error,
            })
            return false
        }
    }

    async listExclusiveRoles(guildId: string): Promise<Array<{
        roleId: string
        excludedRoleId: string
    }>> {
        try {
            const result = await (prisma.roleExclusion.findMany as (args: unknown) => Promise<Array<{
                roleId: string
                excludedRoleId: string
            }>>)({
                where: { guildId },
                orderBy: { createdAt: 'desc' },
            })
            return result ?? []
        } catch (error) {
            errorLog({
                message: 'Failed to list exclusive roles:',
                error,
            })
            return []
        }
    }

    async handleGuildMemberUpdate(
        oldMember: GuildMember | PartialGuildMember,
        newMember: GuildMember,
    ): Promise<void> {
        if (!newMember.guild) {
            return
        }

        if (!(await this.isEnabled(newMember.guild.id))) {
            return
        }

        const oldRoles = oldMember.roles?.cache ?? newMember.roles.cache
        const newRoles = newMember.roles.cache

        const addedRoles = Array.from(newRoles.keys()).filter(
            (roleId) => !oldRoles.has(roleId),
        )

        if (addedRoles.length === 0) {
            return
        }

        try {
            const exclusions = await (prisma.roleExclusion.findMany as (args: unknown) => Promise<Array<{
                excludedRoleId: string
            }>>)({
                where: {
                    guildId: newMember.guild.id,
                    roleId: { in: addedRoles },
                },
            })

            if (exclusions.length === 0) {
                return
            }

            type ExclusionType = {
                excludedRoleId: string
            }
            const rolesToRemove = exclusions.map((exclusion: ExclusionType) => exclusion.excludedRoleId)

            for (const roleId of rolesToRemove) {
                if (newMember.roles.cache.has(roleId)) {
                    try {
                        const role = await newMember.guild.roles.fetch(roleId)
                        if (role) {
                            await newMember.roles.remove(role)
                            debugLog({
                                message: `Automatically removed role ${roleId} from ${newMember.user.id} due to exclusive role rule`,
                            })
                        }
                    } catch (error) {
                        errorLog({
                            message: `Failed to remove exclusive role ${roleId}:`,
                            error,
                        })
                    }
                }
            }
        } catch (error) {
            errorLog({
                message: 'Failed to handle guild member update:',
                error,
            })
        }
    }
}

export const roleManagementService = new RoleManagementService()
