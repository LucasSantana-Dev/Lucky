import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command.js'
import { autoModService } from '@lukbot/shared/services'
import { infoLog, errorLog } from '@lukbot/shared/utils'
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
                        .setName('interval')
                        .setDescription('Timeframe in seconds (default: 5)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(60),
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to take')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Warn', value: 'warn' },
                            { name: 'Mute', value: 'mute' },
                            { name: 'Kick', value: 'kick' },
                            { name: 'Ban', value: 'ban' },
                        ),
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
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to take')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Warn', value: 'warn' },
                            { name: 'Delete', value: 'delete' },
                        ),
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
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to take')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Delete', value: 'delete' },
                            { name: 'Warn', value: 'warn' },
                        ),
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
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to take')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Delete', value: 'delete' },
                            { name: 'Warn', value: 'warn' },
                            { name: 'Kick', value: 'kick' },
                        ),
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
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to take')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Delete', value: 'delete' },
                            { name: 'Warn', value: 'warn' },
                            { name: 'Mute', value: 'mute' },
                        ),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('raid')
                .setDescription('Configure raid protection')
                .addBooleanOption((option) =>
                    option
                        .setName('enabled')
                        .setDescription('Enable raid protection')
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('threshold')
                        .setDescription('Max joins in timeframe (default: 10)')
                        .setRequired(false)
                        .setMinValue(5)
                        .setMaxValue(50),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('interval')
                        .setDescription('Timeframe in seconds (default: 10)')
                        .setRequired(false)
                        .setMinValue(5)
                        .setMaxValue(60),
                )
                .addStringOption((option) =>
                    option
                        .setName('action')
                        .setDescription('Action to take')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Kick', value: 'kick' },
                            { name: 'Ban', value: 'ban' },
                        ),
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

                const embed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('🤖 Auto-Moderation Settings')
                    .addFields(
                        {
                            name: '📨 Spam Detection',
                            value: settings.spamEnabled
                                ? `✅ Enabled\n└ ${settings.spamThreshold} messages in ${settings.spamInterval / 1000}s → ${settings.spamAction}`
                                : '❌ Disabled',
                        },
                        {
                            name: '🔠 Caps Detection',
                            value: settings.capsEnabled
                                ? `✅ Enabled\n└ ${settings.capsThreshold}% caps, min ${settings.capsMinLength} chars → ${settings.capsAction}`
                                : '❌ Disabled',
                        },
                        {
                            name: '🔗 Link Filtering',
                            value: settings.linksEnabled
                                ? `✅ Enabled\n└ Action: ${settings.linksAction}\n└ Whitelist: ${settings.linksWhitelist.length} domains`
                                : '❌ Disabled',
                        },
                        {
                            name: '📧 Invite Filtering',
                            value: settings.invitesEnabled
                                ? `✅ Enabled\n└ Action: ${settings.invitesAction}`
                                : '❌ Disabled',
                        },
                        {
                            name: '🚫 Bad Words Filter',
                            value: settings.wordsEnabled
                                ? `✅ Enabled\n└ ${settings.wordsList.length} words → ${settings.wordsAction}`
                                : '❌ Disabled',
                        },
                        {
                            name: '🛡️ Raid Protection',
                            value: settings.raidEnabled
                                ? `✅ Enabled\n└ ${settings.raidThreshold} joins in ${settings.raidInterval / 1000}s → ${settings.raidAction}`
                                : '❌ Disabled',
                        },
                    )
                    .setTimestamp()

                if (settings.ignoredChannels.length > 0) {
                    embed.addFields({
                        name: 'Ignored Channels',
                        value: settings.ignoredChannels
                            .map((id) => `<#${id}>`)
                            .join(', '),
                    })
                }

                if (settings.ignoredRoles.length > 0) {
                    embed.addFields({
                        name: 'Ignored Roles',
                        value: settings.ignoredRoles
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
                    const interval = interaction.options.getInteger('interval')
                    const action = interaction.options.getString('action')

                    if (threshold) updateData.spamThreshold = threshold
                    if (interval) updateData.spamInterval = interval * 1000
                    if (action) updateData.spamAction = action
                }
            } else if (subcommand === 'caps') {
                updateData.capsEnabled = enabled
                if (enabled) {
                    const percentage =
                        interaction.options.getInteger('percentage')
                    const minLength =
                        interaction.options.getInteger('min_length')
                    const action = interaction.options.getString('action')

                    if (percentage) updateData.capsThreshold = percentage
                    if (minLength) updateData.capsMinLength = minLength
                    if (action) updateData.capsAction = action
                }
            } else if (subcommand === 'links') {
                updateData.linksEnabled = enabled
                if (enabled) {
                    const action = interaction.options.getString('action')
                    if (action) updateData.linksAction = action
                }
            } else if (subcommand === 'invites') {
                updateData.invitesEnabled = enabled
                if (enabled) {
                    const action = interaction.options.getString('action')
                    if (action) updateData.invitesAction = action
                }
            } else if (subcommand === 'words') {
                updateData.wordsEnabled = enabled
                if (enabled) {
                    const action = interaction.options.getString('action')
                    if (action) updateData.wordsAction = action
                }
            } else if (subcommand === 'raid') {
                updateData.raidEnabled = enabled
                if (enabled) {
                    const threshold =
                        interaction.options.getInteger('threshold')
                    const interval = interaction.options.getInteger('interval')
                    const action = interaction.options.getString('action')

                    if (threshold) updateData.raidThreshold = threshold
                    if (interval) updateData.raidInterval = interval * 1000
                    if (action) updateData.raidAction = action
                }
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
