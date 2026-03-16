import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits, ChannelType } from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { requireGuild } from '../../../utils/command/commandValidations'
import { successEmbed, errorEmbed, infoEmbed } from '../../../utils/general/embeds'
import { errorLog } from '@lucky/shared/utils'
import { starboardService } from '@lucky/shared/services'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Manage the server starboard')
        .addSubcommand((sub) =>
            sub
                .setName('setup')
                .setDescription('Set up the starboard channel')
                .addChannelOption((o) =>
                    o
                        .setName('channel')
                        .setDescription('Channel to post starred messages')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((o) =>
                    o
                        .setName('emoji')
                        .setDescription('Reaction emoji to track (default: ⭐)')
                        .setRequired(false),
                )
                .addIntegerOption((o) =>
                    o
                        .setName('threshold')
                        .setDescription('Number of reactions needed (default: 3)')
                        .setMinValue(1)
                        .setRequired(false),
                )
                .addBooleanOption((o) =>
                    o
                        .setName('self-star')
                        .setDescription('Allow users to star their own messages (default: false)')
                        .setRequired(false),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('disable').setDescription('Disable the starboard'),
        )
        .addSubcommand((sub) =>
            sub.setName('top').setDescription('Show top 5 starred messages'),
        )
        .addSubcommand((sub) =>
            sub.setName('status').setDescription('Show current starboard configuration'),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'general',
    execute: async ({ interaction }) => {
        if (!(await requireGuild(interaction))) return
        if (!interaction.guild) return

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel('channel', true)
                const emoji = interaction.options.getString('emoji') ?? '⭐'
                const threshold = interaction.options.getInteger('threshold') ?? 3
                const selfStar = interaction.options.getBoolean('self-star') ?? false

                await starboardService.upsertConfig(interaction.guild.id, {
                    channelId: channel.id,
                    emoji,
                    threshold,
                    selfStar,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            successEmbed(
                                'Starboard Configured',
                                `Starboard set to ${channel} with emoji **${emoji}** and threshold **${threshold}**.`,
                            ),
                        ],
                    },
                })
            } else if (subcommand === 'disable') {
                await starboardService.deleteConfig(interaction.guild.id)
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [successEmbed('Starboard Disabled', 'The starboard has been disabled.')],
                    },
                })
            } else if (subcommand === 'top') {
                const entries = await starboardService.getTopEntries(interaction.guild.id, 5)

                if (entries.length === 0) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [infoEmbed('Top Starred Messages', 'No starred messages yet.')],
                        },
                    })
                    return
                }

                const description = entries
                    .map(
                        (e: { guildId: string; channelId: string; messageId: string; starCount: number }, i: number) =>
                            `**${i + 1}.** ⭐ ${e.starCount} — [Jump](https://discord.com/channels/${e.guildId}/${e.channelId}/${e.messageId})`,
                    )
                    .join('\n')

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [infoEmbed('Top Starred Messages', description)],
                    },
                })
            } else if (subcommand === 'status') {
                const config = await starboardService.getConfig(interaction.guild.id)

                if (!config) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [infoEmbed('Starboard Status', 'Starboard is not configured.')],
                        },
                    })
                    return
                }

                const description = [
                    `**Channel:** <#${config.channelId}>`,
                    `**Emoji:** ${config.emoji}`,
                    `**Threshold:** ${config.threshold}`,
                    `**Self-Star:** ${config.selfStar ? 'Yes' : 'No'}`,
                ].join('\n')

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [infoEmbed('Starboard Status', description)],
                    },
                })
            }
        } catch (error) {
            errorLog({ message: 'Error in starboard command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        errorEmbed(
                            'Error',
                            error instanceof Error ? error.message : 'An error occurred.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
