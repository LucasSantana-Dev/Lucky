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

const prisma = getPrismaClient()

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

export class ReactionRolesService {
    async isEnabled(guildId?: string, userId?: string): Promise<boolean> {
        return featureToggleService.isEnabled('REACTION_ROLES', {
            guildId,
            userId,
        })
    }

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
                throw new Error('No action rows created - at least one role is required')
            }

            const message = await channel.send({
                embeds: [embed],
                components: actionRows.length > 0 ? actionRows : [],
            })

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

    async deleteReactionRoleMessage(
        messageId: string,
        guildId: string,
    ): Promise<boolean> {
        try {
            const message = await prisma.reactionRoleMessage.findUnique({
                where: { messageId },
                include: { mappings: true },
            })

            if (!message || (message as { guildId: string }).guildId !== guildId) {
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

    async listReactionRoleMessages(guildId: string) {
        try {
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

        if (!(await this.isEnabled(interaction.guild.id, interaction.user.id))) {
            await interaction.reply({
                content: 'Reaction roles are disabled for this server.',
                ephemeral: true,
            })
            return true
        }

        const roleId = customId.replace('reactionrole:', '')

        try {
            const mapping = await prisma.reactionRoleMapping.findFirst({
                where: {
                    buttonId: customId,
                    message: {
                        messageId: interaction.message.id,
                    },
                },
                include: { message: true },
            }) as { message?: { guildId: string } } | null

            if (!mapping || !mapping.message || mapping.message.guildId !== interaction.guild.id) {
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

export const reactionRolesService = new ReactionRolesService()
