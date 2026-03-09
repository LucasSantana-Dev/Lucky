import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { autoModService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply.js'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure auto-moderation settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('spam')
                .setDescription('Configure spam detection')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Enable spam detection')
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('threshold')
                        .setDescription(
                            'Max messages in timeframe (default: 5)',
                        )
                        .setRequired(false)
                        .setMinValue(2)
                        .setMaxValue(20),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('timewindow')
                        .setDescription('Timeframe in seconds (default: 5)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(60),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('caps')
                .setDescription('Configure caps detection')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Enable caps detection')
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('percentage')
                        .setDescription('Max caps percentage (default: 70)')
                        .setRequired(false)
                        .setMinValue(50)
                        .setMaxValue(100),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('min_length')
                        .setDescription(
                            'Minimum message length to check (default: 10)',
                        )
                        .setRequired(false)
                        .setMinValue(5)
                        .setMaxValue(50),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('links')
                .setDescription('Configure link filtering')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Enable link filtering')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('invites')
                .setDescription('Configure invite link filtering')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Enable invite filtering')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('words')
                .setDescription('Configure bad words filter')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Enable bad words filter')
                        .setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('View current auto-moderation settings'),
        ),
    category: 'automod',
    execute: async ({ interaction }) => {
        if (!interaction.guild) {
            await interactionReply({
                interaction,
                content: {
                    content: '❌ This command can only be used in a server.',
                },
            })
            return
        }

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'status') {
                const settings = await autoModService.getSettings(
                    interaction.guild.id,
                )
                if (!settings) {
                    await interactionReply({
                        interaction,
                        content: {
                            content:
                                '❌ No auto-mod settings found. Use `/automod configure` first.',
                        },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🤖 Auto-Moderation Settings')
                    .addFields(
                        {
                            name: '📨 Spam Detection',
                            value: settings.spamEnabled
                                ? `✅ Enabled\n└ ${settings.spamThreshold} messages in ${settings.spamTimeWindow}s`
                                : '❌ Disabled',
                        },
                        {
                            name: '🔠 Caps Detection',
                            value: settings.capsEnabled
                                ? `✅ Enabled\n└ ${settings.capsThreshold}% caps threshold`
                                : '❌ Disabled',
                        },
                        {
                            name: '🔗 Link Filtering',
                            value: settings.linksEnabled
                                ? `✅ Enabled\n└ Allowed domains: ${settings.allowedDomains.length}`
                                : '❌ Disabled',
                        },
                        {
                            name: '📧 Invite Filtering',
                            value: settings.invitesEnabled
                                ? `✅ Enabled`
                                : '❌ Disabled',
                        },
                        {
                            name: '🚫 Bad Words Filter',
                            value: settings.wordsEnabled
                                ? `✅ Enabled\n└ ${settings.bannedWords.length} banned words`
                                : '❌ Disabled',
                        },
                    )
                    .setTimestamp()

                if (settings.exemptChannels.length > 0) {
                    embed.addFields({
                        name: 'Exempt Channels',
                        value: settings.exemptChannels
                            .map((id) => `<#${id}>`)
                            .join(', '),
                    })
                }

                if (settings.exemptRoles.length > 0) {
                    embed.addFields({
                        name: 'Exempt Roles',
                        value: settings.exemptRoles
                            .map((id) => `<@&${id}>`)
                            .join(', '),
                    })
                }

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })
                return
            }

            const enabled = interaction.options.getBoolean('enabled', true)
            const updateData: any = {}

            if (subcommand === 'spam') {
                updateData.spamEnabled = enabled
                if (enabled) {
                    const threshold =
                        interaction.options.getInteger('threshold')
                    const timewindow =
                        interaction.options.getInteger('timewindow')

                    if (threshold) updateData.spamThreshold = threshold
                    if (timewindow) updateData.spamTimeWindow = timewindow
                }
            } else if (subcommand === 'caps') {
                updateData.capsEnabled = enabled
                if (enabled) {
                    const percentage =
                        interaction.options.getInteger('percentage')

                    if (percentage) updateData.capsThreshold = percentage
                }
            } else if (subcommand === 'links') {
                updateData.linksEnabled = enabled
            } else if (subcommand === 'invites') {
                updateData.invitesEnabled = enabled
            } else if (subcommand === 'words') {
                updateData.wordsEnabled = enabled
            }

            await autoModService.updateSettings(
                interaction.guild.id,
                updateData,
            )

            const embed = new EmbedBuilder()
                .setColor(enabled ? 0x51cf66 : 0xc92a2a)
                .setTitle(
                    `🤖 Auto-Moderation ${enabled ? 'Enabled' : 'Disabled'}`,
                )
                .addFields({
                    name: 'Module',
                    value: subcommand.toUpperCase(),
                    inline: true,
                })
                .setTimestamp()

            await interactionReply({
                interaction,
                content: { embeds: [embed] },
            })

            infoLog({
                message: `Auto-mod ${subcommand} ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag} in ${interaction.guild.name}`,
            })
        } catch (error) {
            errorLog({
                message: 'Failed to update auto-mod settings',
                error: error as Error,
            })

            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ Failed to update auto-moderation settings. Please try again.',
                },
            })
        }
    },
})
