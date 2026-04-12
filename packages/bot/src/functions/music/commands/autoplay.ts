import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { guildSettingsService } from '@lucky/shared/services'
import { recommendationFeedbackService } from '../../../services/musicRecommendation/feedbackService'
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
import { trackHistoryService } from '@lucky/shared/services'
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

async function handleAutoplayMode(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Guild Not Found',
                        'Unable to retrieve guild information.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const mode = interaction.options.getString('mode')

    if (!mode) {
        // Get current mode
        const settings = await guildSettingsService.getGuildSettings(guildId)
        const currentMode = settings?.autoplayMode ?? 'similar'

        const modeDescriptions: Record<string, string> = {
            similar: "🎵 Music like what's playing",
            discover: '🔭 Prioritize new artists',
            popular: '🔥 Favour your liked tracks',
        }

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createEmbed({
                        title: '🎚️ Autoplay Mode',
                        description: `**Current mode:** ${currentMode}
${modeDescriptions[currentMode] || 'Unknown mode'}`,
                        color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                        emoji: EMOJIS.AUTOPLAY,
                        timestamp: true,
                    }),
                ],
                ephemeral: true,
            },
        })
        return
    }

    // Set new mode
    const success = await guildSettingsService.updateGuildSettings(guildId, {
        autoplayMode: mode as 'similar' | 'discover' | 'popular',
    })

    if (!success) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Failed to update autoplay mode.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const modeEmojis: Record<string, string> = {
        similar: '🎵',
        discover: '🔭',
        popular: '🔥',
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '✅ Autoplay mode updated',
                    description: `${modeEmojis[mode]} Mode set to **${mode}**`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleAutoplayAnalytics(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Guild Not Found',
                        'Unable to retrieve guild information.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    try {
        const stats = await trackHistoryService.getAutoplayStats(guildId, 200)

        if (stats.total === 0) {
            await interactionReply({
                interaction,
                content: {
                    embeds: [
                        createEmbed({
                            title: '📈 Autoplay Analytics',
                            description: 'No play history yet.',
                            color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                            emoji: EMOJIS.AUTOPLAY,
                            timestamp: true,
                        }),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        const artistsText =
            stats.topAutoplayArtists.length > 0
                ? stats.topAutoplayArtists
                      .map(
                          (a, i) =>
                              `${i + 1}. ${a.artist} — ${a.count} play${a.count !== 1 ? 's' : ''}`,
                      )
                      .join('\n')
                : 'No autoplay data yet.'

        const analyticsEmbed = createEmbed({
            title: '📈 Autoplay Analytics',
            description: `**Recent plays:** ${stats.total} tracks in the last 200\n**Autoplay:** ${stats.autoplayCount} (${stats.autoplayPercent}%)\n\n**Top autoplay artists:**\n${artistsText}`,
            color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
            emoji: EMOJIS.AUTOPLAY,
            timestamp: true,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [analyticsEmbed],
                ephemeral: true,
            },
        })
    } catch (error) {
        errorLog({
            message: 'Failed to fetch autoplay analytics',
            error,
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Failed to retrieve autoplay analytics.',
                    ),
                ],
                ephemeral: true,
            },
        })
    }
}

async function handleAutoplayArtist(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const userId = interaction.user.id
    const guildId = interaction.guildId
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Guild Not Found',
                        'Unable to retrieve guild information.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const subcommandName = interaction.options.getSubcommand()
    const artistName = interaction.options.getString('artist')

    try {
        switch (subcommandName) {
            case 'prefer': {
                if (!artistName) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Missing Input',
                                    'Please provide an artist name.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await recommendationFeedbackService.setArtistFeedback(
                    guildId,
                    userId,
                    artistName,
                    'prefer',
                )

                const preferEmbed = createEmbed({
                    title: '⭐ Artist Preferred',
                    description: `**${artistName}** will be prioritized in autoplay recommendations.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [preferEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            case 'block': {
                if (!artistName) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Missing Input',
                                    'Please provide an artist name.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await recommendationFeedbackService.setArtistFeedback(
                    guildId,
                    userId,
                    artistName,
                    'block',
                )

                const blockEmbed = createEmbed({
                    title: '🚫 Artist Blocked',
                    description: `**${artistName}** will not appear in autoplay recommendations.`,
                    color: EMBED_COLORS.ERROR as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [blockEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            case 'remove': {
                if (!artistName) {
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Missing Input',
                                    'Please provide an artist name.',
                                ),
                            ],
                            ephemeral: true,
                        },
                    })
                    return
                }

                await recommendationFeedbackService.removeArtistFeedback(
                    guildId,
                    userId,
                    artistName,
                )

                const removeEmbed = createEmbed({
                    title: '✓ Preference Removed',
                    description: `**${artistName}** preference has been removed.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [removeEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            case 'list': {
                const summary =
                    await recommendationFeedbackService.getArtistFeedbackSummary(
                        userId,
                    )

                const preferredText =
                    summary.preferred.length > 0
                        ? summary.preferred.map((a: string) => `⭐ ${a}`).join('\n')
                        : 'No preferred artists.'

                const blockedText =
                    summary.blocked.length > 0
                        ? summary.blocked.map((a: string) => `🚫 ${a}`).join('\n')
                        : 'No blocked artists.'

                const listEmbed = createEmbed({
                    title: '🎯 Your Artist Preferences',
                    description: `**Preferred:** (${summary.preferred.length})\n${preferredText}\n\n**Blocked:** (${summary.blocked.length})\n${blockedText}`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                })

                await interactionReply({
                    interaction,
                    content: {
                        embeds: [listEmbed],
                        ephemeral: true,
                    },
                })
                break
            }

            default:
                await interactionReply({
                    interaction,
                    content: {
                        embeds: [
                            createErrorEmbed(
                                'Unknown Subcommand',
                                'This subcommand is not recognized.',
                            ),
                        ],
                        ephemeral: true,
                    },
                })
        }
    } catch (error) {
        errorLog({
            message: 'Failed to handle artist preference',
            error,
            data: { guildId, userId, subcommandName },
        })
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Failed to update artist preferences.',
                    ),
                ],
                ephemeral: true,
            },
        })
    }
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
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('analytics')
                .setDescription('Show autoplay stats and top artists'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('mode')
                .setDescription('Get or set autoplay recommendation mode')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription(
                            'similar (default) | discover | popular',
                        )
                        .addChoices(
                            {
                                name: "🎵 Similar — music like what's playing",
                                value: 'similar',
                            },
                            {
                                name: '🔭 Discover — prioritize new artists',
                                value: 'discover',
                            },
                            {
                                name: '🔥 Popular — favour your liked tracks',
                                value: 'popular',
                            },
                        )
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('artist')
                .setDescription('Manage artist preferences for autoplay')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('prefer')
                        .setDescription('Mark an artist as preferred')
                        .addStringOption((opt) =>
                            opt
                                .setName('artist')
                                .setDescription('Artist name')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('block')
                        .setDescription('Block an artist from appearing')
                        .addStringOption((opt) =>
                            opt
                                .setName('artist')
                                .setDescription('Artist name')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('list')
                        .setDescription('Show your preferred and blocked artists'),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove artist preference')
                        .addStringOption((opt) =>
                            opt
                                .setName('artist')
                                .setDescription('Artist name')
                                .setRequired(true),
                        ),
                ),
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
            const subcommand = interaction.options.getSubcommand()

            switch (subcommand) {
                case 'skip':
                case 'clear':
                case 'status':
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
                    if (subcommand === 'skip')
                        await handleSkipAutoplayTrack(interaction, queue)
                    else if (subcommand === 'clear')
                        await handleClearAutoplayTracks(interaction, queue)
                    else await handleAutoplayStatus(interaction, queue)
                    break
                case 'analytics':
                    await handleAutoplayAnalytics(interaction)
                    break
                case 'mode':
                    await handleAutoplayMode(interaction)
                    break
                case 'artist':
                    await handleAutoplayArtist(interaction)
                    break
                default:
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Unknown Subcommand',
                                    'Please use skip, clear, status, analytics, mode, or artist.',
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
