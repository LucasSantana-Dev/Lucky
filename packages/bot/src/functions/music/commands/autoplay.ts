import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { guildSettingsService, lastFmLinkService } from '@lucky/shared/services'
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
import type { QueueMetadata } from '../../../types/QueueMetadata'

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

    let descriptionLines = [
        `**Autoplay tracks queued:** ${autoplayCount}`,
        '**Last.fm integration:** Connected',
    ]

    const metadata = queue.metadata as QueueMetadata
    const vcMemberIds = metadata?.vcMemberIds ?? []
    if (vcMemberIds.length > 1) {
        const linkedUsers = await Promise.all(
            vcMemberIds.map(async (id) => {
                const link = await lastFmLinkService.getByDiscordId(id)
                return link?.lastFmUsername ? id : null
            }),
        )
        const linkedCount = linkedUsers.filter((id) => id !== null).length
        if (linkedCount > 1) {
            descriptionLines.push(`🎭 Blending taste for ${linkedCount} users`)
        }
    }

    const statusEmbed = createEmbed({
        title: '📊 Autoplay Status',
        description: descriptionLines.join('\n'),
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

async function handleAutoplayGenreAdd(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) return

    const tag = interaction.options.getString('tag')
    if (!tag) return

    const settings = await guildSettingsService.getGuildSettings(guildId)
    const genres = settings?.autoplayGenres ?? []

    if (genres.length >= 5) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Limit Reached',
                        'Maximum 5 genres allowed per guild.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const lowerTag = tag.toLowerCase().trim()
    if (genres.includes(lowerTag)) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Already Added',
                        `Genre **${lowerTag}** is already in your list.`,
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const updated = await guildSettingsService.updateGuildSettings(guildId, {
        autoplayGenres: [...genres, lowerTag],
    })

    if (!updated) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Error', 'Failed to add genre.')],
                ephemeral: true,
            },
        })
        return
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '✅ Genre added',
                    description: `Added **${lowerTag}** to autoplay genres.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleAutoplayGenreRemove(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) return

    const tag = interaction.options.getString('tag')
    if (!tag) return

    const settings = await guildSettingsService.getGuildSettings(guildId)
    const genres = settings?.autoplayGenres ?? []

    const lowerTag = tag.toLowerCase().trim()
    if (!genres.includes(lowerTag)) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Not Found',
                        `Genre **${lowerTag}** is not in your list.`,
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const updated = await guildSettingsService.updateGuildSettings(guildId, {
        autoplayGenres: genres.filter((g: string) => g !== lowerTag),
    })

    if (!updated) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Error', 'Failed to remove genre.')],
                ephemeral: true,
            },
        })
        return
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '✅ Genre removed',
                    description: `Removed **${lowerTag}** from autoplay genres.`,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleAutoplayGenreList(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) return

    const settings = await guildSettingsService.getGuildSettings(guildId)
    const genres = settings?.autoplayGenres ?? []

    const description =
        genres.length > 0
            ? genres.map((g: string, i: number) => `${i + 1}. ${g}`).join('\n')
            : 'No genres configured yet.'

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '🎵 Autoplay Genres',
                    description,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

async function handleAutoplayGenreClear(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) return

    const settings = await guildSettingsService.getGuildSettings(guildId)
    const genres = settings?.autoplayGenres ?? []

    if (genres.length === 0) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('No Genres', 'No genres to clear.')],
                ephemeral: true,
            },
        })
        return
    }

    const updated = await guildSettingsService.updateGuildSettings(guildId, {
        autoplayGenres: [],
    })

    if (!updated) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Error', 'Failed to clear genres.')],
                ephemeral: true,
            },
        })
        return
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '✅ Genres cleared',
                    description: 'All autoplay genres have been removed.',
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

async function handleAutoplayGenre(
    interaction: ChatInputCommandInteraction,
    subcommand: string | null,
): Promise<void> {
    switch (subcommand) {
        case 'add':
            return handleAutoplayGenreAdd(interaction)
        case 'remove':
            return handleAutoplayGenreRemove(interaction)
        case 'list':
            return handleAutoplayGenreList(interaction)
        case 'clear':
            return handleAutoplayGenreClear(interaction)
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
                .setName('genre')
                .setDescription('Configure autoplay genres and moods')
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription('Add a genre to autoplay (max 5)')
                        .addStringOption((opt) =>
                            opt
                                .setName('tag')
                                .setDescription(
                                    'Genre/mood tag (e.g., rock, indie, chillhop)',
                                )
                                .setRequired(true),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a genre from autoplay')
                        .addStringOption((opt) =>
                            opt
                                .setName('tag')
                                .setDescription('Genre/mood tag to remove')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('list')
                        .setDescription('Show all configured autoplay genres'),
                )
                .addSubcommand((sub) =>
                    sub.setName('clear').setDescription('Remove all genres'),
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
            const subcommandGroup =
                interaction.options.getSubcommandGroup(false)
            const subcommand = interaction.options.getSubcommand(false)

            if (subcommandGroup === 'genre') {
                await handleAutoplayGenre(interaction, subcommand)
                return
            }

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
                default:
                    await interactionReply({
                        interaction,
                        content: {
                            embeds: [
                                createErrorEmbed(
                                    'Unknown Subcommand',
                                    'Please use skip, clear, status, analytics, mode, or genre.',
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
