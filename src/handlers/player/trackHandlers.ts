import type { Track, GuildQueue } from 'discord-player'
import type { ColorResolvable, TextChannel, User } from 'discord.js'
import { infoLog, debugLog, errorLog } from '../../utils/general/log'
import { addTrackToHistory } from '../../utils/music/duplicateDetection'
import { replenishQueue } from '../../utils/music/trackManagement'
import { createEmbed, EMBED_COLORS } from '../../utils/general/embeds'
import {
    getAutoplayCount,
    resetAutoplayCount,
} from '../../utils/music/autoplayManager'
import { featureToggleService } from '../../services/FeatureToggleService'
import { constants } from '../../config/config'

export const lastPlayedTracks = new Map<string, Track>()

export type TrackHistoryEntry = {
    url: string
    title: string
    author: string
    thumbnail?: string
    timestamp: number
}

export const recentlyPlayedTracks = new Map<string, TrackHistoryEntry[]>()

const songInfoMessages = new Map<
    string,
    { messageId: string; channelId: string }
>()

interface IQueueMetadata {
    channel: TextChannel
    client: unknown
    requestedBy: User | undefined
}

type PlayerEvents = {
    events: {
        on: (event: string, handler: Function) => void
    }
}

type SetupTrackHandlersParams = {
    player: PlayerEvents
    client: { user?: { id: string } | null }
}

export const setupTrackHandlers = ({ player, client }: SetupTrackHandlersParams): void => {
    player.events.on('playerStart', async (queue: GuildQueue, track: Track) => {
        await handlePlayerStart(queue, track, client)
    })

    player.events.on('playerFinish', async (queue: GuildQueue) => {
        await handlePlayerFinish(queue)
    })

    player.events.on('playerSkip', async (queue: GuildQueue) => {
        await handlePlayerSkip(queue)
    })

    player.events.on('audioTracksAdd', (queue: GuildQueue, tracks: Track[]) => {
        handleAudioTracksAdd(queue, tracks)
    })
}

function handleAutoplayCounter(
    queue: GuildQueue,
    isAutoplay: boolean,
    isAutoplayEnabled: boolean,
): void {
    if (!isAutoplay && !isAutoplayEnabled) {
        resetAutoplayCount(queue.guild.id)
        debugLog({
            message: `Reset autoplay counter for guild ${queue.guild.id} - manual track played and autoplay disabled`,
        })
    } else if (!isAutoplay && isAutoplayEnabled) {
        debugLog({
            message: `Manual track played but autoplay is enabled - keeping autoplay counter for radio experience`,
        })
    }
}

async function handleQueueReplenishment(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    const context = {
        guildId: queue.guild.id,
        userId: track.requestedBy?.id,
    }
    const autoplayEnabled = await featureToggleService.isEnabled(
        'AUTOPLAY',
        context,
    )
    if (autoplayEnabled) {
        try {
            await replenishQueue(queue)
            debugLog({
                message: 'Queue replenished after track start',
                data: {
                    trackTitle: track.title,
                    guildId: queue.guild.id,
                    queueSize: queue.tracks.size,
                },
            })
        } catch (error) {
            errorLog({
                message: 'Error replenishing queue after track start:',
                error,
            })
        }
    } else {
        debugLog({
            message: 'Autoplay feature disabled, skipping queue replenishment',
        })
    }
}

const handlePlayerStart = async (
    queue: GuildQueue,
    track: Track,
    client: { user?: { id: string } | null },
): Promise<void> => {
    try {
        infoLog({
            message: `Started playing "${track.title}" in ${queue.guild.name}`,
        })

        debugLog({ message: `Track URL: ${track.url}` })

        if (queue.node.volume !== constants.VOLUME) {
            queue.node.setVolume(constants.VOLUME)
        }

        const isAutoplay = track.requestedBy?.id === client.user?.id
        const isAutoplayEnabled = queue.repeatMode === 3

        handleAutoplayCounter(queue, isAutoplay, isAutoplayEnabled)
        await handleQueueReplenishment(queue, track)

        if (isAutoplay) {
            debugLog({
                message: 'Autoplay track started, sending playing message',
                data: { trackTitle: track.title, guildId: queue.guild.id },
            })
        } else {
            debugLog({
                message: 'Manual track started, skipping message (already handled by play command)',
                data: { trackTitle: track.title, guildId: queue.guild.id },
            })
            return
        }

        try {
            const metadata = queue.metadata as IQueueMetadata

            const formatDuration = (duration: string) => {
                if (!duration || duration === '0:00') return 'Unknown duration'
                return duration
            }

            const getSource = (url: string) => {
                if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
                if (url.includes('spotify.com')) return 'Spotify'
                if (url.includes('soundcloud.com')) return 'SoundCloud'
                return 'Unknown'
            }

            const requester = track.requestedBy
            const requesterInfo = requester
                ? `Added by **${requester.username}**`
                : 'Added automatically'

            const embed = createEmbed({
                title: '🎵 Now Playing',
                description: `[**${track.title}**](${track.url}) by **${track.author}**`,
                color: EMBED_COLORS.MUSIC as ColorResolvable,
                thumbnail: track.thumbnail,
                timestamp: true,
                fields: [
                    {
                        name: '⏱️ Duration',
                        value: formatDuration(track.duration),
                        inline: true,
                    },
                    {
                        name: '🌐 Source',
                        value: getSource(track.url),
                        inline: true,
                    },
                    {
                        name: '👤 Requested',
                        value: requesterInfo,
                        inline: true,
                    },
                ],
                footer: `Autoplay • ${getAutoplayCount(queue.guild.id)}/${constants.MAX_AUTOPLAY_TRACKS ?? 50} songs`,
            })

            if (metadata?.channel) {
                const message = await metadata.channel.send({
                    embeds: [embed],
                })

                songInfoMessages.set(queue.guild.id, {
                    messageId: message.id,
                    channelId: metadata.channel.id,
                })

                debugLog({
                    message: 'Sent autoplay track message to channel',
                    data: {
                        guildId: queue.guild.id,
                        trackTitle: track.title,
                    },
                })
            }
        } catch (error) {
            errorLog({
                message: 'Error sending autoplay track message:',
                error,
            })
        }
    } catch (error) {
        errorLog({ message: 'Error in player start handler:', error })
    }
}

const handlePlayerFinish = async (queue: GuildQueue): Promise<void> => {
    try {
        if (queue.currentTrack) {
            addTrackToHistory(queue.currentTrack, queue.guild.id)
        }

        const context = {
            guildId: queue.guild.id,
        }
        const autoplayEnabled = await featureToggleService.isEnabled(
            'AUTOPLAY',
            context,
        )
        if (autoplayEnabled) {
            await replenishQueue(queue)
        }
    } catch (error) {
        errorLog({ message: 'Error in playerFinish event:', error })
    }
}

const handlePlayerSkip = async (queue: GuildQueue): Promise<void> => {
    try {
        debugLog({ message: 'Track skipped, checking queue...' })

        if (queue.currentTrack) {
            addTrackToHistory(queue.currentTrack, queue.guild.id)
        }

        const context = {
            guildId: queue.guild.id,
        }
        const autoplayEnabled = await featureToggleService.isEnabled(
            'AUTOPLAY',
            context,
        )
        if (autoplayEnabled) {
            await replenishQueue(queue)
        }
    } catch (error) {
        errorLog({ message: 'Error in playerSkip event:', error })
    }
}

const handleAudioTracksAdd = (queue: GuildQueue, tracks: Track[]): void => {
    if (Array.isArray(tracks) && tracks.length > 0) {
        infoLog({
            message: `Added "${tracks[0].title}" to queue in ${queue.guild.name}`,
        })
    }
}
