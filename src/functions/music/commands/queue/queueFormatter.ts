import type { Track, GuildQueue } from 'discord-player'
import type { ColorResolvable } from 'discord.js'
import { createEmbed, EMBED_COLORS } from '../../../../utils/general/embeds'
import { getTrackInfo } from '../../../../utils/music/trackUtils'
import type { CustomClient } from '../../../../types/index'

export interface FormattedQueueData {
    manualTracks: Track[]
    autoplayTracks: Track[]
    totalTracks: number
}

export function formatCurrentTrackEmbed(
    queue: GuildQueue | null,
    client: CustomClient,
): { name: string; value: string } {
    const currentTrack = queue?.currentTrack
    if (!currentTrack) {
        return {
            name: '▶️ Now Playing',
            value: 'No music is currently playing',
        }
    }

    const trackInfo = getTrackInfo(currentTrack)
    const isAutoplay = currentTrack.requestedBy?.id === client.user?.id
    const tag = isAutoplay ? '🤖 Autoplay' : '👤 Manual'

    let nextTrackInfo = ''
    const nextTrack = queue?.tracks.at(0)
    if (nextTrack) {
        const nextTrackData = getTrackInfo(nextTrack)
        const isNextAutoplay = nextTrack.requestedBy?.id === client.user?.id
        const nextTag = isNextAutoplay ? '🤖 Autoplay' : '👤 Manual'
        nextTrackInfo = `\n\n⏭️ Next song:\n**${nextTrackData.title}**\nDuration: ${nextTrackData.duration}\nRequested by: ${nextTrackData.requester}\n${nextTag}`
    }

    return {
        name: '▶️ Now Playing',
        value: `**${trackInfo.title}**\nDuration: ${trackInfo.duration}\nRequested by: ${trackInfo.requester}\n${tag}${nextTrackInfo}`,
    }
}

export function formatManualTracksList(
    manualTracks: Track[],
    _client: CustomClient,
): string {
    const tracksList: string[] = []
    const maxTracks = Math.min(manualTracks.length, 10)

    for (let i = 0; i < maxTracks; i++) {
        const track = manualTracks[i]
        if (!track) continue

        const trackInfo = getTrackInfo(track)
        tracksList.push(
            `${i + 1}. **${trackInfo.title}**\n   Duration: ${trackInfo.duration} | Requested by: ${trackInfo.requester} 👤 Manual`,
        )
    }

    return tracksList.join('\n\n')
}

export function formatAutoplayTracksList(
    autoplayTracks: Track[],
    _client: CustomClient,
): string {
    const tracksList: string[] = []
    const maxTracks = Math.min(autoplayTracks.length, 10)

    for (let i = 0; i < maxTracks; i++) {
        const track = autoplayTracks[i]
        if (!track) continue

        const trackInfo = getTrackInfo(track)
        tracksList.push(
            `${i + 1}. **${trackInfo.title}**\n   Duration: ${trackInfo.duration} | Requested by: ${trackInfo.requester} 🤖 Autoplay`,
        )
    }

    return tracksList.join('\n\n')
}

export function formatRemainingTracks(
    manualTracks: Track[],
    autoplayTracks: Track[],
): string | null {
    const remainingManual = Math.max(0, manualTracks.length - 10)
    const remainingAutoplay = Math.max(0, autoplayTracks.length - 10)

    if (remainingManual === 0 && remainingAutoplay === 0) {
        return null
    }

    let remainingText = 'And '
    if (remainingManual > 0) {
        remainingText += `${remainingManual} more manual songs`
    }
    if (remainingAutoplay > 0) {
        if (remainingManual > 0) remainingText += ' and '
        remainingText += `${remainingAutoplay} more autoplay songs`
    }
    remainingText += ' in queue...'

    return remainingText
}

export function formatQueueStatistics(
    queue: GuildQueue | null,
    data: FormattedQueueData,
): { name: string; value: string } {
    const repeatMode = queue?.repeatMode ? 'Enabled' : 'Disabled'
    const volume = queue?.node.volume ?? 100
    const trackCount = queue?.tracks?.size ?? 0
    const manualCount = data.manualTracks.length
    const autoplayCount = data.autoplayTracks.length

    return {
        name: '📊 Queue Statistics',
        value: `Total songs: ${trackCount}\nManual songs: ${manualCount}\nAutoplay songs: ${autoplayCount}\nRepeat mode: ${repeatMode}\nVolume: ${volume}%`,
    }
}

export function createQueueEmbed(): ReturnType<typeof createEmbed> {
    return createEmbed({
        title: '📄 Music Queue',
        color: EMBED_COLORS.QUEUE as ColorResolvable,
        timestamp: true,
    })
}
