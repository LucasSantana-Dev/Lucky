import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type Guild,
    type GuildMember,
    type Message,
    type TextChannel,
    type ButtonInteraction,
    type EmbedBuilder,
} from 'discord.js'
import { errorLog, debugLog } from '../../utils/general/log'
import { featureToggleService } from '../FeatureToggleService'
import { getPrismaClient } from '../../utils/database/prismaClient'

/** Options for creating a reaction role message with button-based role assignments. */
export interface CreateReactionRoleOptions {
    guild: Guild
    channel: TextChannel
    embed: EmbedBuilder
    roles: Array<{
        roleId: string
        label: string
        emoji?: string
        style?: ButtonStyle
    }>
}

/** Options for creating a reaction role message from the dashboard using REST API. */
export interface DashboardCreateReactionRoleOptions {
    guildId: string
    channelId: string
    title: string
    description: string
    imageUrl?: string
    imageFile?: { buffer: Buffer; filename: string; contentType: string }
    botToken: string
    roles: Array<{
        roleId: string
        label: string
        emoji?: string
        style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
    }>
}

export interface DashboardUpdateReactionRoleOptions {
    guildId: string
    messageId: string
    title: string
    description: string
    imageUrl?: string
    imageFile?: { buffer: Buffer; filename: string; contentType: string }
    botToken: string
    roles: Array<{
        roleId: string
        label: string
        emoji?: string
        style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
    }>
}

/** Type for ReactionRoleMapping returned from addRoleToMessage. */
export interface ReactionRoleMappingReturn {
    id: string
    messageId: string
    roleId: string
    emoji: string | null
    buttonId: string | null
    type: string
    label: string | null
    style: string | null
}

/** Manages reaction role messages with button-based role assignment. */
export class ReactionRolesService {
    /** Checks if reaction roles feature is enabled for a guild or user. */
    async isEnabled(guildId?: string, userId?: string): Promise<boolean> {
        return featureToggleService.isEnabled('REACTION_ROLES', {
            guildId,
            userId,
        })
    }

    /** Creates a new reaction role message with button-based role assignment. */
    async createReactionRoleMessage(
        options: CreateReactionRoleOptions,
    ): Promise<Message | null> {
        const { guild, channel, embed, roles } = options

        if (!(await this.isEnabled(guild.id))) {
            throw new Error('Reaction roles are disabled for this guild')
        }

        if (roles.length === 0) {
            throw new Error('At least one role is required')
        }

        if (roles.length > 25) {
            throw new Error('Maximum 25 roles per message')
        }

        try {
            const actionRows: ActionRowBuilder<ButtonBuilder>[] = []
            let currentRow = new ActionRowBuilder<ButtonBuilder>()

            for (const role of roles) {
                const button = new ButtonBuilder()
                    .setCustomId(`reactionrole:${role.roleId}`)
                    .setLabel(role.label)
                    .setStyle(role.style ?? ButtonStyle.Primary)

                if (role.emoji) {
                    button.setEmoji(role.emoji)
                }

                if (currentRow.components.length >= 5) {
                    actionRows.push(currentRow)
                    currentRow = new ActionRowBuilder<ButtonBuilder>()
                }

                currentRow.addComponents(button)
            }

            if (currentRow.components.length > 0) {
                actionRows.push(currentRow)
            }

            if (actionRows.length === 0) {
                throw new Error(
                    'No action rows created - at least one role is required',
                )
            }

            const message = await channel.send({
                embeds: [embed],
                components: actionRows.length > 0 ? actionRows : [],
            })

            const prisma = getPrismaClient()
            try {
                await prisma.reactionRoleMessage.create({
                    data: {
                        messageId: message.id,
                        channelId: channel.id,
                        guildId: guild.id,
                        mappings: {
                            create: roles.map((role) => ({
                                roleId: role.roleId,
                                buttonId: `reactionrole:${role.roleId}`,
                                type: 'button',
                                label: role.label,
                                style: role.style?.toString() ?? 'Primary',
                                emoji: role.emoji ?? null,
                            })),
                        },
                    },
                })
            } catch (dbError) {
                // DB write failed — delete the Discord message to avoid orphan
                await message.delete().catch(() => undefined)
                throw dbError
            }

            debugLog({
                message: `Created reaction role message ${message.id} in guild ${guild.id}`,
            })

            return message
        } catch (error) {
            errorLog({
                message: 'Failed to create reaction role message:',
                error,
            })
            throw error
        }
    }

    private parseEmoji(
        emoji: string,
    ): { id?: string; name: string; animated?: boolean } | null {
        if (!emoji) {
            return null
        }
        const match = emoji.match(/^<(a)?:([^:]+):(\d+)>$/)
        if (match) {
            return { id: match[3], name: match[2], animated: match[1] === 'a' }
        }
        return { name: emoji }
    }

    /** Creates a reaction role message from the dashboard using the Discord REST API. */
    async createReactionRoleMessageFromDashboard(
        options: DashboardCreateReactionRoleOptions,
    ): Promise<{ messageId: string }> {
        const {
            guildId,
            channelId,
            title,
            description,
            imageUrl,
            imageFile,
            botToken,
            roles,
        } = options

        if (!(await this.isEnabled(guildId))) {
            throw new Error('Reaction roles are disabled for this guild')
        }

        if (roles.length === 0) {
            throw new Error('At least one role is required')
        }

        if (roles.length > 25) {
            throw new Error('Maximum 25 roles per message')
        }

        // Validate Discord snowflake IDs before they are interpolated into the
        // request URL — defense-in-depth against SSRF / path traversal from
        // user-provided values (rejects anything non-numeric).
        this.assertSnowflakes(guildId, channelId)

        // Validate each roleId in the input
        for (const role of roles) {
            this.assertSnowflakes(guildId, undefined, role.roleId)
        }

        try {
            const actionRows = this.buildButtonRows(roles)

            const DISCORD_API = 'https://discord.com/api/v10'
            const { headers, body } = this.buildDiscordMessageRequest({
                title,
                description,
                imageUrl,
                imageFile,
                actionRows,
                botToken,
            })

            if (!/^\d{17,20}$/.test(channelId)) {
                throw new Error('Invalid Discord channel id')
            }
            const resp = await fetch(
                `${DISCORD_API}/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers,
                    body,
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!resp.ok) {
                const text = await resp.text().catch(() => '')
                throw new Error(`Discord API error ${resp.status}: ${text}`)
            }

            const discordMessage = (await resp.json()) as { id: string }
            const messageId = discordMessage.id

            const prisma = getPrismaClient()
            try {
                await prisma.reactionRoleMessage.create({
                    data: {
                        messageId,
                        channelId,
                        guildId,
                        title,
                        description,
                        imageUrl: imageFile ? null : (imageUrl ?? null),
                        mappings: {
                            create: roles.map((role) => ({
                                roleId: role.roleId,
                                buttonId: `reactionrole:${role.roleId}`,
                                type: 'button',
                                label: role.label,
                                style: role.style ?? 'Primary',
                                emoji: role.emoji ?? null,
                            })),
                        },
                    },
                })
            } catch (dbError) {
                // DB write failed — delete the Discord message to avoid orphan
                await fetch(
                    `${DISCORD_API}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
                    {
                        method: 'DELETE',
                        headers: { Authorization: `Bot ${botToken}` },
                        signal: AbortSignal.timeout(5_000),
                    },
                ).catch(() => undefined)
                throw dbError
            }

            debugLog({
                message: `Created reaction role message ${messageId} in guild ${guildId} from dashboard`,
            })

            return { messageId }
        } catch (error) {
            errorLog({
                message:
                    'Failed to create reaction role message from dashboard:',
                error,
            })
            throw error
        }
    }

    private buildDiscordMessageRequest(options: {
        title: string
        description: string
        imageUrl?: string
        imageFile?: { buffer: Buffer; filename: string; contentType: string }
        actionRows: object[]
        botToken: string
        includeAttachments?: boolean
    }): { headers: Record<string, string>; body: FormData | string } {
        const {
            title,
            description,
            imageUrl,
            imageFile,
            actionRows,
            botToken,
            includeAttachments = false,
        } = options

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const embed: Record<string, any> = {
            title,
            description,
            color: 5793266,
        }

        if (imageFile) {
            // Attachment reference for file upload
            embed.image = { url: `attachment://${imageFile.filename}` }
        } else if (imageUrl) {
            // HTTP URL
            embed.image = { url: imageUrl }
        }

        if (imageFile) {
            // Multipart FormData for file
            const formData = new FormData()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: Record<string, any> = {
                embeds: [embed],
                components: actionRows,
            }
            if (includeAttachments) {
                payload.attachments = []
            }
            formData.append('payload_json', JSON.stringify(payload))
            formData.append(
                'files[0]',
                new Blob([new Uint8Array(imageFile.buffer)], {
                    type: imageFile.contentType,
                }),
                imageFile.filename,
            )
            return {
                headers: {
                    Authorization: `Bot ${botToken}`,
                },
                body: formData,
            }
        } else {
            // JSON for URL or no image
            return {
                headers: {
                    Authorization: `Bot ${botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [embed],
                    components: actionRows,
                }),
            }
        }
    }

    private buildButtonRows(
        roles: Array<{
            roleId: string
            label: string
            emoji?: string
            style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
        }>,
    ): object[] {
        const styleMap: Record<string, number> = {
            Primary: 1,
            Secondary: 2,
            Success: 3,
            Danger: 4,
        }

        const actionRows: object[] = []
        let currentButtons: object[] = []

        for (const role of roles) {
            const button: Record<string, unknown> = {
                type: 2,
                custom_id: `reactionrole:${role.roleId}`,
                label: role.label,
                style: styleMap[role.style ?? 'Primary'] ?? 1,
            }

            if (role.emoji) {
                const parsedEmoji = this.parseEmoji(role.emoji)
                if (parsedEmoji) {
                    button.emoji = parsedEmoji
                }
            }

            if (currentButtons.length >= 5) {
                actionRows.push({ type: 1, components: currentButtons })
                currentButtons = []
            }

            currentButtons.push(button)
        }

        if (currentButtons.length > 0) {
            actionRows.push({ type: 1, components: currentButtons })
        }

        return actionRows
    }

    private assertSnowflakes(
        guildId: string,
        channelId?: string,
        messageId?: string,
    ): void {
        const SNOWFLAKE = /^\d{17,20}$/
        if (!SNOWFLAKE.test(guildId)) {
            throw new Error('Invalid guildId: expected a Discord snowflake ID')
        }
        if (channelId && !SNOWFLAKE.test(channelId)) {
            throw new Error(
                'Invalid channelId: expected a Discord snowflake ID',
            )
        }
        if (messageId && !SNOWFLAKE.test(messageId)) {
            throw new Error(
                'Invalid messageId: expected a Discord snowflake ID',
            )
        }
    }

    /** Updates an existing reaction role message with new title, description, roles, and optional image. */
    async updateReactionRoleMessage(
        options: DashboardUpdateReactionRoleOptions,
    ): Promise<{ messageId: string }> {
        const {
            guildId,
            messageId,
            title,
            description,
            imageUrl,
            imageFile,
            botToken,
            roles,
        } = options

        if (!(await this.isEnabled(guildId))) {
            throw new Error('Reaction roles are disabled for this guild')
        }

        if (roles.length === 0) {
            throw new Error('At least one role is required')
        }

        if (roles.length > 25) {
            throw new Error('Maximum 25 roles per message')
        }

        try {
            // Validate IDs early for security (SSRF prevention)
            this.assertSnowflakes(guildId, undefined, messageId)

            const prisma = getPrismaClient()
            const message = await prisma.reactionRoleMessage.findUnique({
                where: { messageId },
                include: { mappings: true },
            })

            if (!message || message.guildId !== guildId) {
                throw new Error('Reaction role message not found')
            }

            // Now validate roleIds
            for (const role of roles) {
                this.assertSnowflakes(guildId, undefined, role.roleId)
            }

            // Validate the channel ID from the stored message
            const channelId = message.channelId
            this.assertSnowflakes(guildId, channelId)

            const actionRows = this.buildButtonRows(roles)

            const DISCORD_API = 'https://discord.com/api/v10'
            const { headers, body } = this.buildDiscordMessageRequest({
                title,
                description,
                imageUrl,
                imageFile,
                actionRows,
                botToken,
                includeAttachments: true,
            })

            if (
                !/^\d{17,20}$/.test(channelId) ||
                !/^\d{17,20}$/.test(messageId)
            ) {
                throw new Error('Invalid Discord channel or message id')
            }

            // Store the original mappings for rollback if Discord update fails
            const originalMappings = message.mappings

            // Update the database first with new mappings (DB-first approach)
            await prisma.$transaction([
                prisma.reactionRoleMapping.deleteMany({
                    where: { messageId },
                }),
                prisma.reactionRoleMessage.update({
                    where: { messageId },
                    data: {
                        title,
                        description,
                        imageUrl: imageFile ? null : (imageUrl ?? null),
                        mappings: {
                            create: roles.map((role) => ({
                                roleId: role.roleId,
                                buttonId: `reactionrole:${role.roleId}`,
                                type: 'button',
                                label: role.label,
                                style: role.style ?? 'Primary',
                                emoji: role.emoji ?? null,
                            })),
                        },
                    },
                }),
            ])

            // Now attempt to update Discord
            try {
                const resp = await fetch(
                    `${DISCORD_API}/channels/${channelId}/messages/${messageId}`,
                    {
                        method: 'PATCH',
                        headers,
                        body,
                        signal: AbortSignal.timeout(10_000),
                    },
                )

                if (!resp.ok) {
                    const text = await resp.text().catch(() => '')
                    throw new Error(
                        `Discord API error ${resp.status}: ${text}`,
                    )
                }
            } catch (discordError) {
                // Discord update failed — rollback DB to original state
                try {
                    await prisma.$transaction([
                        prisma.reactionRoleMapping.deleteMany({
                            where: { messageId },
                        }),
                        prisma.reactionRoleMessage.update({
                            where: { messageId },
                            data: {
                                title: message.title,
                                description: message.description,
                                imageUrl: message.imageUrl,
                                mappings: {
                                    create: originalMappings.map((m: any) => ({
                                        roleId: m.roleId,
                                        buttonId: m.buttonId,
                                        type: m.type,
                                        label: m.label,
                                        style: m.style,
                                        emoji: m.emoji,
                                    })),
                                },
                            },
                        }),
                    ])
                } catch (rollbackError) {
                    errorLog({
                        message:
                            'Failed to rollback DB after Discord update failure:',
                        error: rollbackError,
                    })
                }
                throw discordError
            }

            debugLog({
                message: `Updated reaction role message ${messageId} in guild ${guildId}`,
            })

            return { messageId }
        } catch (error) {
            errorLog({
                message: 'Failed to update reaction role message:',
                error,
            })
            throw error
        }
    }

    /** Deletes a reaction role message and its associated mappings. */
    async deleteReactionRoleMessage(
        messageId: string,
        guildId: string,
    ): Promise<boolean> {
        const prisma = getPrismaClient()
        const message = await prisma.reactionRoleMessage.findUnique({
            where: { messageId },
            include: { mappings: true },
        })

        if (!message || message.guildId !== guildId) {
            return false
        }

        try {
            await prisma.reactionRoleMessage.delete({
                where: { messageId },
            })
        } catch (error) {
            // P2025: row vanished between the findUnique check and the delete
            // (concurrent delete) — preserve the not-found contract instead of
            // throwing. Any other DB error still propagates.
            if ((error as { code?: string }).code === 'P2025') {
                return false
            }
            throw error
        }

        debugLog({
            message: `Deleted reaction role message ${messageId} from guild ${guildId}`,
        })

        return true
    }

    /** Lists all reaction role messages for a guild. */
    async listReactionRoleMessages(guildId: string) {
        try {
            const prisma = getPrismaClient()
            const result = await prisma.reactionRoleMessage.findMany({
                where: { guildId },
                include: { mappings: true },
                orderBy: { createdAt: 'desc' },
            })
            return result
        } catch (error) {
            errorLog({
                message: 'Failed to list reaction role messages:',
                error,
            })
            throw error
        }
    }

    /** Handles button interaction for reaction role assignment or removal. */
    async handleButtonInteraction(
        interaction: ButtonInteraction,
    ): Promise<boolean> {
        if (!interaction.guild || !interaction.member) {
            return false
        }

        const customId = interaction.customId
        if (!customId.startsWith('reactionrole:')) {
            return false
        }

        if (
            !(await this.isEnabled(interaction.guild.id, interaction.user.id))
        ) {
            await interaction.reply({
                content: 'Reaction roles are disabled for this server.',
                ephemeral: true,
            })
            return true
        }

        const roleId = customId.replace('reactionrole:', '')

        try {
            const prisma = getPrismaClient()
            const mapping = await prisma.reactionRoleMapping.findFirst({
                where: {
                    buttonId: customId,
                    message: {
                        messageId: interaction.message.id,
                    },
                },
                include: { message: true },
            })

            if (
                !mapping ||
                !mapping.message ||
                mapping.message.guildId !== interaction.guild.id
            ) {
                await interaction.reply({
                    content: 'This reaction role is no longer valid.',
                    ephemeral: true,
                })
                return true
            }

            const role = await interaction.guild.roles.fetch(roleId)
            if (!role) {
                await interaction.reply({
                    content: 'The role for this button no longer exists.',
                    ephemeral: true,
                })
                return true
            }

            const member = interaction.member as GuildMember

            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(role)
                await interaction.reply({
                    content: `Removed role ${role.name}.`,
                    ephemeral: true,
                })
            } else {
                await member.roles.add(role)
                await interaction.reply({
                    content: `Added role ${role.name}.`,
                    ephemeral: true,
                })
            }

            return true
        } catch (error) {
            errorLog({
                message: 'Failed to handle button interaction:',
                error,
            })

            try {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true,
                })
            } catch {
                // Interaction may have already been replied to
            }

            return true
        }
    }

    async addRoleToMessage(
        messageId: string,
        newMapping: {
            roleId: string
            label: string
            emoji?: string | null
            style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
        },
        botToken: string,
    ): Promise<{
        status: 'ok' | 'partial_success'
        mapping: ReactionRoleMappingReturn
    }> {
        if (!/^\d{17,20}$/.test(newMapping.roleId)) {
            throw new Error('Invalid roleId: expected a Discord snowflake ID')
        }

        const prisma = getPrismaClient()

        // Load the message and its existing mappings to check basic validity
        const message = await prisma.reactionRoleMessage.findUnique({
            where: { messageId },
            include: { mappings: true },
        })

        if (!message) {
            throw new Error('Reaction role message not found')
        }

        // Capacity check and insert are moved into the transaction to prevent
        // TOCTOU race condition (issue #1558). Capacity is checked atomically
        // with the insert inside the transaction.
        let createdMapping: any
        try {
            createdMapping = await prisma.$transaction(async (tx: any) => {
                // Count current mappings inside transaction for atomicity
                const currentCount = await tx.reactionRoleMapping.count({
                    where: { messageId },
                })

                if (currentCount >= 25) {
                    throw new Error('Message already at capacity')
                }

                // Check for duplicate roleId inside transaction
                const existing = await tx.reactionRoleMapping.findFirst({
                    where: {
                        messageId,
                        roleId: newMapping.roleId,
                    },
                })

                if (existing) {
                    throw new Error('Role already mapped')
                }

                return tx.reactionRoleMapping.create({
                    data: {
                        messageId,
                        roleId: newMapping.roleId,
                        buttonId: `reactionrole:${newMapping.roleId}`,
                        type: 'button',
                        label: newMapping.label,
                        style: newMapping.style ?? 'Primary',
                        emoji: newMapping.emoji ?? null,
                    },
                })
            })
        } catch (txError) {
            throw txError
        }

        // After DB insert, PATCH Discord with the full button set (existing + new)
        try {
            const allMappings = [...message.mappings, createdMapping]
            const actionRows = this.buildButtonRows(
                allMappings.map((m) => ({
                    roleId: m.roleId,
                    label: m.label ?? '',
                    emoji: m.emoji ?? undefined,
                    style: (m.style ?? 'Primary') as
                        | 'Primary'
                        | 'Secondary'
                        | 'Success'
                        | 'Danger',
                })),
            )

            this.assertSnowflakes(message.guildId, message.channelId, messageId)

            const DISCORD_API = 'https://discord.com/api/v10'
            const { headers, body } = this.buildDiscordMessageRequest({
                title: message.title ?? '',
                description: message.description ?? '',
                imageUrl: message.imageUrl ?? undefined,
                actionRows,
                botToken,
            })

            const resp = await fetch(
                `${DISCORD_API}/channels/${message.channelId}/messages/${messageId}`,
                {
                    method: 'PATCH',
                    headers,
                    body,
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!resp.ok) {
                return {
                    status: 'partial_success' as const,
                    mapping: createdMapping,
                }
            }

            return { status: 'ok' as const, mapping: createdMapping }
        } catch (discordError) {
            return {
                status: 'partial_success' as const,
                mapping: createdMapping,
            }
        }
    }
}

/** Singleton instance of ReactionRolesService. */
export const reactionRolesService = new ReactionRolesService()
