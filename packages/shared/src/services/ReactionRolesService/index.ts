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
    botToken: string
    roles: Array<{
        roleId: string
        label: string
        emoji?: string
        style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
    }>
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
        const { guildId, channelId, title, description, botToken, roles } =
            options

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
                    button.emoji = this.parseEmoji(role.emoji)
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

            const DISCORD_API = 'https://discord.com/api/v10'
            const resp = await fetch(
                `${DISCORD_API}/channels/${channelId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bot ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        embeds: [{ title, description, color: 5793266 }],
                        components: actionRows,
                    }),
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
                    `${DISCORD_API}/channels/${channelId}/messages/${messageId}`,
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

    /** Deletes a reaction role message and its associated mappings. */
    async deleteReactionRoleMessage(
        messageId: string,
        guildId: string,
    ): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            const message = await prisma.reactionRoleMessage.findUnique({
                where: { messageId },
                include: { mappings: true },
            })

            if (!message || message.guildId !== guildId) {
                return false
            }

            await prisma.reactionRoleMessage.delete({
                where: { messageId },
            })

            debugLog({
                message: `Deleted reaction role message ${messageId} from guild ${guildId}`,
            })

            return true
        } catch (error) {
            errorLog({
                message: 'Failed to delete reaction role message:',
                error,
            })
            return false
        }
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
            return []
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
}

/** Singleton instance of ReactionRolesService. */
export const reactionRolesService = new ReactionRolesService()
