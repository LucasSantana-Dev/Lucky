import {
    ChannelType,
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed, createSuccessEmbed } from '../../../utils/general/embeds'
import { channelCleanupService, starboardService } from '@lucky/shared/services'
import { requireGuild } from '../../../utils/command/commandValidations'
import { assertDefined } from '@lucky/shared/utils/guards'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { COLOR } from '@lucky/shared/constants'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('cleanup')
        .setDescription('Configure automatic channel cleanup (purge or TTL)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('set-interval')
                .setDescription('Enable interval-based purge (wipes channel every N minutes)')
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to clean up')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('minutos')
                        .setDescription('Minutes between purges (minimum 60)')
                        .setMinValue(60)
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('set-ttl')
                .setDescription('Enable TTL-based delete (deletes messages N seconds after posting)')
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to clean up')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('segundos')
                        .setDescription('Seconds before deletion (5-86400)')
                        .setMinValue(5)
                        .setMaxValue(86400)
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('disable')
                .setDescription('Disable cleanup for a channel')
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to stop cleaning up')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('List all configured cleanup channels for this guild'),
        ),
    category: 'management',
    execute: async ({ interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const guildId = assertDefined(interaction.guildId, 'Guild ID required after requireGuild check')

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const subcommand = interaction.options.getSubcommand()

        try {
            if (subcommand === 'set-interval') {
                await handleSetInterval(interaction, guildId)
            } else if (subcommand === 'set-ttl') {
                await handleSetTtl(interaction, guildId)
            } else if (subcommand === 'disable') {
                await handleDisable(interaction, guildId)
            } else if (subcommand === 'list') {
                await handleList(interaction, guildId)
            }
        } catch {
            await interactionReply({
                interaction,
                content: { embeds: [createErrorEmbed('Error', 'An error occurred while processing your request.')] },
            })
        }
    },
})

async function handleSetInterval(interaction: ChatInputCommandInteraction, guildId: string) {
    const channel = interaction.options.getChannel('channel')
    const minutes = interaction.options.getInteger('minutos', true)

    if (!channel) {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Channel not found.')] },
        })
        return
    }

    // Check if channel is the starboard
    const starboardConfig = await starboardService.getConfig(guildId)
    if (starboardConfig && starboardConfig.channelId === channel.id) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Cannot Configure',
                        'Cannot set cleanup for the starboard channel.',
                    ),
                ],
            },
        })
        return
    }

    try {
        await channelCleanupService.upsertConfig(guildId, channel.id, {
            mode: 'purge_interval',
            intervalMinutes: minutes,
            ttlSeconds: null,
            enabled: true,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        'Cleanup Configured',
                        `Channel <#${channel.id}> will be purged every **${minutes} minutes**.`,
                    ),
                ],
            },
        })
    } catch {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Failed to save configuration.')] },
        })
    }
}

async function handleSetTtl(interaction: ChatInputCommandInteraction, guildId: string) {
    const channel = interaction.options.getChannel('channel')
    const seconds = interaction.options.getInteger('segundos', true)

    if (!channel) {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Channel not found.')] },
        })
        return
    }

    // Check if channel is the starboard
    const starboardConfig = await starboardService.getConfig(guildId)
    if (starboardConfig && starboardConfig.channelId === channel.id) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Cannot Configure',
                        'Cannot set cleanup for the starboard channel.',
                    ),
                ],
            },
        })
        return
    }

    try {
        await channelCleanupService.upsertConfig(guildId, channel.id, {
            mode: 'ttl',
            intervalMinutes: null,
            ttlSeconds: seconds,
            enabled: true,
        })

        const minSec = Math.floor(seconds / 60)
        const secOnly = seconds % 60
        const timeStr =
            minSec > 0
                ? secOnly > 0
                    ? `**${minSec}m ${secOnly}s**`
                    : `**${minSec} minute${minSec === 1 ? '' : 's'}**`
                : `**${seconds} second${seconds === 1 ? '' : 's'}**`

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        'Cleanup Configured',
                        `Messages in <#${channel.id}> will be deleted ${timeStr} after posting.`,
                    ),
                ],
            },
        })
    } catch {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Failed to save configuration.')] },
        })
    }
}

async function handleDisable(interaction: ChatInputCommandInteraction, guildId: string) {
    const channel = interaction.options.getChannel('channel')

    if (!channel) {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Channel not found.')] },
        })
        return
    }

    try {
        const config = await channelCleanupService.getConfig(guildId, channel.id)

        if (!config) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [createErrorEmbed('Not Configured', 'This channel does not have cleanup configured.')],
                },
            })
            return
        }

        await channelCleanupService.disableCleanup(guildId, channel.id)

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createSuccessEmbed(
                        'Cleanup Disabled',
                        `Cleanup disabled for <#${channel.id}>.`,
                    ),
                ],
            },
        })
    } catch {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Failed to disable cleanup.')] },
        })
    }
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string) {
    try {
        const configs = await channelCleanupService.listConfigs(guildId)

        if (configs.length === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Channel Cleanup Configs')
                            .setDescription('No cleanup configurations found.')
                            .setColor(COLOR.SETUP_PURPLE),
                    ],
                },
            })
            return
        }

        const fields = configs.map((config) => {
            const enabled = config.enabled ? '✅' : '❌'
            let modeStr = ''

            if (config.mode === 'purge_interval') {
                modeStr = `**Purge every ${config.intervalMinutes} min**`
            } else if (config.mode === 'ttl') {
                modeStr = `**Delete after ${config.ttlSeconds}s**`
            }

            return {
                name: `${enabled} <#${config.channelId}>`,
                value: modeStr,
                inline: false,
            }
        })

        const embed = new EmbedBuilder()
            .setTitle('Channel Cleanup Configurations')
            .setColor(COLOR.SETUP_PURPLE)
            .addFields(fields)

        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
    } catch {
        await interactionReply({
            interaction,
            content: { embeds: [createErrorEmbed('Error', 'Failed to retrieve configurations.')] },
        })
    }
}
