import type { Track, GuildQueue } from 'discord-player'
import type { ColorResolvable, TextChannel, User } from 'discord.js'
import { debugLog, errorLog } from '@nexus/shared/utils'
import { createEmbed, EMBED_COLORS } from '../../utils/general/embeds'
import { getAutoplayCount } from '../../utils/music/autoplayManager'
import { constants } from '@nexus/shared/config'
import {
    isLastFmConfigured,
    getSessionKeyForUser,
    updateNowPlaying as lastFmUpdateNowPlaying,
    scrobble as lastFmScrobble,
} from '../../lastfm'

interface IQueueMetadata {
    channel: TextChannel
    client: unknown
    requestedBy: User | undefined
}

const songInfoMessages = new Map<
    string,
    { messageId: string; channelId: string }
>()
const lastFmTrackStartTime = new Map<string, number>()

function formatDuration(duration: string) {
    if (!duration || duration === '0:00') return 'Unknown duration'
    return duration
}

function getSource(url: string) {
    if (url.includes('youtube.com') || url.includes('youtu.be'))
        return 'YouTube'
    if (url.includes('spotify.com')) return 'Spotify'
    if (url.includes('soundcloud.com')) return 'SoundCloud'
    return 'Unknown'
}

export async function sendNowPlayingEmbed(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
): Promise<void> {
    const metadata = queue.metadata as IQueueMetadata
    if (!metadata?.channel) return

    const requester = track.requestedBy
    const requesterInfo = requester
        ? `Added by **${requester.username}**`
        : 'Added automatically'
    const footer = isAutoplay
        ? `Autoplay • ${getAutoplayCount(queue.guild.id)}/${constants.MAX_AUTOPLAY_TRACKS ?? 50} songs`
        : requesterInfo

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
            { name: '🌐 Source', value: getSource(track.url), inline: true },
            { name: '👤 Requested', value: requesterInfo, inline: true },
        ],
        footer,
    })

    const nowPlayingText = `Now playing: ${track.author} – ${track.title}`
    const message = await metadata.channel.send({
        content: nowPlayingText,
        embeds: [embed],
    })

    songInfoMessages.set(queue.guild.id, {
        messageId: message.id,
        channelId: metadata.channel.id,
    })

    debugLog({
        message: 'Sent now playing message to channel',
        data: { guildId: queue.guild.id, trackTitle: track.title, isAutoplay },
    })
}

export async function updateLastFmNowPlaying(
    queue: GuildQueue,
    track: Track,
): Promise<void> {
    if (!isLastFmConfigured()) return
    const sessionKey = await getSessionKeyForUser(track.requestedBy?.id)
    if (!sessionKey) return
    const durationSec =
        typeof track.duration === 'number'
            ? Math.round(track.duration / 1000)
            : undefined
    try {
        await lastFmUpdateNowPlaying(
            track.author,
            track.title,
            durationSec,
            sessionKey,
        )
        lastFmTrackStartTime.set(queue.guild.id, Math.floor(Date.now() / 1000))
    } catch (err) {
        errorLog({ message: 'Last.fm updateNowPlaying failed', error: err })
    }
}

export async function scrobbleCurrentTrackIfLastFm(
    queue: GuildQueue,
): Promise<void> {
    const track = queue.currentTrack
    if (!track || !isLastFmConfigured()) return
    const sessionKey = await getSessionKeyForUser(track.requestedBy?.id)
    if (!sessionKey) return
    const startedAt = lastFmTrackStartTime.get(queue.guild.id)
    lastFmTrackStartTime.delete(queue.guild.id)
    const timestamp = startedAt ?? Math.floor(Date.now() / 1000)
    const durationSec =
        typeof track.duration === 'number'
            ? Math.round(track.duration / 1000)
            : undefined
    try {
        await lastFmScrobble(
            track.author,
            track.title,
            timestamp,
            durationSec,
            sessionKey,
        )
    } catch (err) {
        errorLog({ message: 'Last.fm scrobble failed', error: err })
    }
}
