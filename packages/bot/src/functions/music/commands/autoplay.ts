import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    createEmbed,
    createErrorEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../utils/general/embeds'
import { errorLog, debugLog } from '@lucky/shared/utils'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { replenishQueue } from '../../../utils/music/trackManagement/queueOperations'
import { resolveGuildQueue } from '../../../utils/music/queueResolver'
import type { ColorResolvable, ChatInputCommandInteraction } from 'discord.js'
import type { GuildQueue } from 'discord-player'

function isAutoplayTrack(track: any): boolean {
    return (track?.metadata as any)?.isAutoplay === true
}

async function handleSkipAutoplayTrack(
    interaction: ChatInputCommandInteraction,
    queue: GuildQueue,
): Promise<void> {
    if (queue.tracks.size === 0) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Queue Empty',
                        'No autoplay tracks to skip.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    let skipped = false
    for (let i = 0; i < queue.tracks.size; i++) {
        const track = queue.tracks.at(i)
        if (track && isAutoplayTrack(track)) {
            queue.removeTrack(i)
            skipped = true
            debugLog({
                message: 'Skipped autoplay track',
                data: {
                    guildId: queue.guild.id,
                    trackTitle: track.title,
                },
            })
            break
        }
    }

    if (!skipped) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'No Autoplay Tracks',
                        'No autoplay tracks found in queue.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    await replenishQueue(queue)

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '⏭️ Autoplay track skipped',
                    description:
                        'First autoplay track removed and queue replenished.',
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleClearAutoplayTracks(
    interaction: ChatInputCommandInteraction,
    queue: GuildQueue,
): Promise<void> {
    let clearedCount = 0
    for (let i = queue.tracks.size - 1; i >= 0; i--) {
        const track = queue.tracks.at(i)
        if (track && isAutoplayTrack(track)) {
            queue.removeTrack(i)
            clearedCount++
        }
    }

    if (clearedCount === 0) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'No Autoplay Tracks',
                        'No autoplay tracks in queue to clear.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    await replenishQueue(queue)

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '🗑️ Autoplay tracks cleared',
                    description: `Removed ${clearedCount} autoplay track(s) and replenished queue.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleAutoplayStatus(
    interaction: ChatInputCommandInteraction,
    queue: GuildQueue,
): Promise<void> {
    let autoplayCount = 0
    for (let i = 0; i < queue.tracks.size; i++) {
        const track = queue.tracks.at(i)
        if (track && isAutoplayTrack(track)) {
            autoplayCount++
        }
    }

    const statusEmbed = createEmbed({
        title: '📊 Autoplay Status',
        description: `**Autoplay tracks queued:** ${autoplayCount}\n**Last.fm integration:** Connected`,
        color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
        emoji: EMOJIS.AUTOPLAY,
        timestamp: true,
    })

    await interactionReply({
        interaction,
        content: {
            embeds: [statusEmbed],
            ephemeral: true,
        },
    })
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('🔄 Manage autoplay tracks in the queue')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('skip')
                .setDescription(
                    'Skip the first autoplay track and replenish queue',
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('clear')
                .setDescription(
                    'Remove all autoplay tracks and replenish queue',
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('Show autoplay queue status'),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const guildId = interaction.guildId
        if (!guildId) return

        const { queue } = resolveGuildQueue(client, guildId)

        try {
            await interaction.deferReply({ ephemeral: true })
        } catch (error) {
            const isUnknownInteraction =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                (error as { code?: number }).code === 10062
            if (isUnknownInteraction) return
            throw error
        }

        try {
            if (!queue) {
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'No Active Queue',
                                'No music is currently playing.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
                return
            }

            const subcommand = interaction.options.getSubcommand()

            switch (subcommand) {
                case 'skip':
                    await handleSkipAutoplayTrack(interaction, queue)
                    break
                case 'clear':
                    await handleClearAutoplayTracks(interaction, queue)
                    break
                case 'status':
                    await handleAutoplayStatus(interaction, queue)
                    break
                default:
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Unknown Subcommand',
                                    'Please use skip, clear, or status.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
            }
        } catch (error) {
            errorLog({ message: 'Error in autoplay command:', error })
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'An error occurred while processing your request.',
                        ),
                    ],
                    ephemeral: true,
                },
            })
        }
    },
})
