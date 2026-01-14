import { SlashCommandBuilder } from '@discordjs/builders'
import {
    EmbedBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    type TextChannel,
} from 'discord.js'
import Command from '../../../../packages/bot/src/models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { reactionRolesService } from '../../../services/ReactionRolesService'
import { errorEmbed, successEmbed } from '../../../utils/general/embeds'
import { errorLog } from '../../../utils/general/log'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage reaction roles with embed builders and buttons')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('create')
                .setDescription('Create a reaction role message')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send the message in')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('title')
                        .setDescription('Embed title')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('description')
                        .setDescription('Embed description')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('roles')
                        .setDescription(
                            'Roles in format: roleId:label:emoji:style (comma-separated). Style: Primary, Secondary, Success, Danger',
                        )
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('delete')
                .setDescription('Delete a reaction role message')
                .addStringOption((option) =>
                    option
                        .setName('message_id')
                        .setDescription('Message ID of the reaction role message')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('list')
                .setDescription('List all reaction role messages in this server'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return

        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'create') {
                const channel = interaction.options.getChannel(
                    'channel',
                    true,
                ) as TextChannel

                if (!channel.isTextBased()) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'Error',
                                    'The channel must be a text channel.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                const title = interaction.options.getString('title', true)
                const description = interaction.options.getString(
                    'description',
                    true,
                )
                const rolesString = interaction.options.getString('roles', true)

                const roles = rolesString.split(',').map((roleStr) => {
                    const parts = roleStr.trim().split(':')
                    if (parts.length < 2) {
                        throw new Error(
                            `Invalid role format: ${roleStr}. Use: roleId:label:emoji:style`,
                        )
                    }

                    const roleId = parts[0].trim()
                    const label = parts[1].trim()
                    const emoji = parts[2]?.trim()
                    const styleStr = parts[3]?.trim() ?? 'Primary'

                    let style = ButtonStyle.Primary
                    if (styleStr === 'Secondary') style = ButtonStyle.Secondary
                    else if (styleStr === 'Success') style = ButtonStyle.Success
                    else if (styleStr === 'Danger') style = ButtonStyle.Danger

                    return { roleId, label, emoji, style }
                })

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(0x5865f2)
                    .setTimestamp()

                const message = await reactionRolesService.createReactionRoleMessage(
                    {
                        guild: interaction.guild,
                        channel,
                        embed,
                        roles,
                    },
                )

                if (message) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                successEmbed(
                                    'Success',
                                    `Reaction role message created in ${channel}!`,
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                }
            } else if (subcommand === 'delete') {
                const messageId = interaction.options.getString('message_id', true)

                const deleted = await reactionRolesService.deleteReactionRoleMessage(
                    messageId,
                    interaction.guild.id,
                )

                if (deleted) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                successEmbed(
                                    'Success',
                                    'Reaction role message deleted.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                } else {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'Error',
                                    'Reaction role message not found or you do not have permission to delete it.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                }
            } else if (subcommand === 'list') {
                const messages =
                    await reactionRolesService.listReactionRoleMessages(
                        interaction.guild.id,
                    )

                if (messages.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                errorEmbed(
                                    'No Messages',
                                    'No reaction role messages found in this server.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                    .setTitle('Reaction Role Messages')
                    .setColor(0x5865f2)
                    .setDescription(
                        messages
                            .map(
                                (msg, index) =>
                                    `${index + 1}. Message ID: \`${msg.messageId}\`\n   Channel: <#${msg.channelId}>\n   Roles: ${msg.mappings.length}`,
                            )
                            .join('\n\n'),
                    )
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [embed],
                        ephemeral: true,
                    },
                })
            }
        } catch (error) {
            errorLog({
                message: 'Error in reactionrole command:',
                error,
            })

            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            'Error',
                            error instanceof Error
                                ? error.message
                                : 'An error occurred while processing your request.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
