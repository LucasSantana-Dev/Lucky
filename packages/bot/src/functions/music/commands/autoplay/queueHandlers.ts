import { interactionReply } from '../../../../utils/general/interactionReply'
import { replenishQueue } from '../../../../utils/music/queueOperations'
import {
    createEmbed,
    createErrorEmbed,
    EMBED_COLORS,
    EMOJIS,
} from '../../../../utils/general/embeds'
import { debugLog } from '@lucky/shared/utils'
import { lastFmLinkService } from '@lucky/shared/services'
import type { ChatInputCommandInteraction, ColorResolvable } from 'discord.js'
import type { GuildQueue, Track } from 'discord-player'
import type { QueueMetadata } from '../../../../types/QueueMetadata'

function isAutoplayTrack(track: Track | null | undefined): boolean {
    return (track?.metadata as { isAutoplay?: boolean })?.isAutoplay === true
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

    try {
        await replenishQueue(queue)
    } catch (_error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Replenish Failed',
                        'Track skipped but the queue could not be replenished. Try `/autoplay skip` again or use `/play` to add tracks manually.',
                    ),
                ],
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
    const autoplayTracks: number[] = []
    for (let i = 0; i < queue.tracks.size; i++) {
        const track = queue.tracks.at(i)
        if (track && isAutoplayTrack(track)) {
            autoplayTracks.push(i)
        }
    }

    if (autoplayTracks.length === 0) {
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

    autoplayTracks.reverse().forEach((index) => {
        const track = queue.tracks.at(index)
        if (track && isAutoplayTrack(track)) {
            queue.removeTrack(index)
        }
    })

    try {
        await replenishQueue(queue)
    } catch (_error) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'Replenish Failed',
                        'Autoplay tracks cleared but the queue could not be replenished. Use `/play` to add tracks manually.',
                    ),
                ],
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
                    title: '🗑️ Autoplay tracks cleared',
                    description: `Removed ${autoplayTracks.length} autoplay tracks and replenished the queue.`,
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
    const metadata = (queue.metadata as QueueMetadata) || {}
    const autoplayEnabled = queue.repeatMode === 2

    let autoplayCount = 0
    for (let i = 0; i < queue.tracks.size; i++) {
        const track = queue.tracks.at(i)
        if (track && isAutoplayTrack(track)) {
            autoplayCount++
        }
    }

    const fields: Array<{ name: string; value: string; inline: boolean }> = [
        {
            name: '🎵 Status',
            value: autoplayEnabled ? `${EMOJIS.AUTOPLAY} Enabled` : 'Disabled',
            inline: true,
        },
        {
            name: '📊 Queue',
            value: `${autoplayCount} / ${queue.tracks.size} tracks`,
            inline: true,
        },
    ]

    const vcMemberIds = metadata?.vcMemberIds ?? []
    if (vcMemberIds.length > 1) {
        try {
            const linkedUsers = await Promise.all(
                vcMemberIds.map(async (id) => {
                    const link = await lastFmLinkService.getByDiscordId(id)
                    return link?.lastFmUsername ? id : null
                }),
            )
            const linkedCount = linkedUsers.filter((id) => id !== null).length
            if (linkedCount > 1) {
                fields.push({
                    name: '🎭 Blend',
                    value: `Mixing taste for ${linkedCount} users`,
                    inline: false,
                })
            }
        } catch {
            // Blend field omitted if Last.fm lookup fails; status still shown
        }
    }

    await interactionReply({
        interaction,
        content: {
            embeds: [
                createEmbed({
                    title: '📻 Autoplay Status',
                    fields,
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
    isAutoplayTrack,
    handleSkipAutoplayTrack,
    handleClearAutoplayTracks,
    handleAutoplayStatus,
}
