import { COLOR } from '@lucky/shared/constants'
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
                .setName('preset')
                .setDescription(
                    'Apply a preset configuration pack to auto-moderation',
                )
                .addStringOption((option) =>
                    option
                        .setName('name')
                        .setDescription(
                            'Preset to apply — omit to list available presets',
                        )
                        .setRequired(false)
                        .addChoices(
                            {
                                name: 'Balanced — baseline for mixed communities',
                                value: 'balanced',
                            },
                            {
                                name: 'Strict Shield — aggressive anti-spam for public servers',
                                value: 'strict',
                            },
                            {
                                name: 'Light - basic spam protection only',
                                value: 'light',
                            },
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
                    content: 'This command can only be used in a server.',
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
                                'No auto-mod settings found. Use `/automod spam` or `/automod preset` first.',
                        },
                    })
                    return
                }

                const embed = new EmbedBuilder()
                    .setColor(COLOR.DISCORD_BLURPLE)
                    .setTitle('Auto-Moderation Settings')
                    .addFields({
                        name: 'Spam Detection',
                        value: settings.spamEnabled
                            ? `Enabled — ${settings.spamThreshold} messages in ${settings.spamTimeWindow}s`
                            : 'Disabled',
                    })
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

            if (subcommand === 'preset') {
                const presetName = interaction.options.getString('name')

                if (!presetName) {
                    const templates = await autoModService.listTemplates()
                    const embed = new EmbedBuilder()
                        .setColor(COLOR.DISCORD_BLURPLE)
                        .setTitle('Auto-Moderation Presets')
                        .setDescription(
                            'Use `/automod preset name:<preset>` to apply one of these configurations.\n\nExisting settings are merged — exempt channels and roles are preserved.',
                        )

                    for (const template of templates) {
                        embed.addFields({
                            name: template.name,
                            value: template.description,
                        })
                    }

                    await interactionReply({
                        interaction,
                        content: { embeds: [embed] },
                    })
                    return
                }

                const { settings, template } =
                    await autoModService.applyTemplate(
                        interaction.guild.id,
                        presetName,
                    )

                const embed = new EmbedBuilder()
                    .setColor(COLOR.ENABLED_GREEN)
                    .setTitle(`Preset Applied: ${template.name}`)
                    .setDescription(template.description)
                    .addFields({
                        name: 'Spam Detection',
                        value: settings.spamEnabled
                            ? `Enabled — ${settings.spamThreshold} messages in ${settings.spamTimeWindow}s`
                            : 'Disabled',
                        inline: true,
                    })
                    .setTimestamp()

                await interactionReply({
                    interaction,
                    content: { embeds: [embed] },
                })

                infoLog({
                    message: `Auto-mod preset '${presetName}' applied by ${interaction.user.tag} in ${interaction.guild.name}`,
                })
                return
            }

            const enabled = interaction.options.getBoolean('enabled', true)
            const updateData: Record<string, unknown> = {}

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
            }

            await autoModService.updateSettings(
                interaction.guild.id,
                updateData,
            )

            const embed = new EmbedBuilder()
                .setColor(enabled ? COLOR.ENABLED_GREEN : COLOR.DISABLED_RED)
                .setTitle(`Auto-Moderation ${enabled ? 'Enabled' : 'Disabled'}`)
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
                        'Failed to update auto-moderation settings. Please try again.',
                },
            })
        }
    },
})
