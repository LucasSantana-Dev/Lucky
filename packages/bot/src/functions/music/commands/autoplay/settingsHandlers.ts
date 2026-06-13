import { ChatInputCommandInteraction, ColorResolvable } from 'discord.js'
import {
    createEmbed,
    createErrorEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../../utils/general/embeds'
import { guildSettingsService, trackHistoryService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../../utils/general/interactionReply'

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
                        description: `**Current mode:** ${currentMode}\n${modeDescriptions[currentMode] || 'Unknown mode'}`,
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
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Guild Not Found', 'Unable to retrieve guild information.')],
                ephemeral: true,
            },
        })
        return
    }

    const tag = interaction.options.getString('tag')
    if (!tag) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Missing Tag', 'Please provide a genre tag.')],
                ephemeral: true,
            },
        })
        return
    }

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
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Guild Not Found', 'Unable to retrieve guild information.')],
                ephemeral: true,
            },
        })
        return
    }

    const tag = interaction.options.getString('tag')
    if (!tag) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Missing Tag', 'Please provide a genre tag.')],
                ephemeral: true,
            },
        })
        return
    }

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
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Guild Not Found', 'Unable to retrieve guild information.')],
                ephemeral: true,
            },
        })
        return
    }

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
    if (!guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [createErrorEmbed('Guild Not Found', 'Unable to retrieve guild information.')],
                ephemeral: true,
            },
        })
        return
    }

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
        default:
            await interactionReply({
                interaction,
                content: {
                    embeds: [createErrorEmbed('Unknown Subcommand', 'That genre subcommand is not recognized.')],
                    ephemeral: true,
                },
            })
    }
}

async function handleAutoplaySertanejo(
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

    const block = interaction.options.getBoolean('block')

    if (block === null) {
        // Get current setting
        const settings = await guildSettingsService.getGuildSettings(guildId)
        const currentBlock = settings?.blockSertanejo ?? true

        const description = currentBlock
            ? '🚫 Sertanejo candidates are blocked unless the seed track is sertanejo'
            : '✅ Sertanejo candidates are allowed'

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createEmbed({
                        title: '🎸 Sertanejo Veto',
                        description: `**Current setting:** ${currentBlock ? 'Blocked' : 'Allowed'}\n${description}`,
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

    // Set new setting
    const success = await guildSettingsService.updateGuildSettings(guildId, {
        blockSertanejo: block,
    })

    if (!success) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Error',
                        'Failed to update sertanejo veto setting.',
                    ),
                ],
                ephemeral: true,
            },
        })
        return
    }

    const statusText = block
        ? '🚫 Sertanejo candidates are now blocked'
        : '✅ Sertanejo candidates are now allowed'

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '✅ Sertanejo veto updated',
                    description: statusText,
                    color: EMBED_COLORS.AUTOPLAY as ColorResolvable,
                    emoji: EMOJIS.AUTOPLAY,
                    timestamp: true,
                }),
            ],
            ephemeral: true,
        },
    })
}

export {
    handleAutoplayMode,
    handleAutoplayGenre,
    handleAutoplayAnalytics,
    handleAutoplaySertanejo,
}
