import type { Track } from 'discord-player'
import { getTrackInfo } from '../../../../utils/music/trackUtils'
import { isSimilarTitle } from '../../../../utils/music/titleComparison'
import type { TrackDisplayInfo, QueueDisplayOptions } from './types'

export async function formatTrackForDisplay(
    track: Track,
    position: number,
    _options: QueueDisplayOptions,
): Promise<TrackDisplayInfo> {
    const trackInfo = await getTrackInfo(track)
    const metadata = (track.metadata ?? {}) as {
        isAutoplay?: boolean
        recommendationReason?: string
    }

    return {
        title: track.title,
        author: track.author,
        url: track.url,
        duration: trackInfo.duration || 'Unknown',
        thumbnail: track.thumbnail,
        requestedBy: track.requestedBy?.username,
        position,
        isAutoplay: metadata.isAutoplay,
        recommendationReason: metadata.recommendationReason,
    }
}

function isAutoplayTrack(track: Track): boolean {
    const meta = (track.metadata ?? {}) as { isAutoplay?: boolean }
    return meta.isAutoplay === true
}

function formatSingleTrack(info: TrackDisplayInfo, index: number): string {
    const marker = info.isAutoplay ? '\u{1F916}' : '\u{1F464}'
    const reason =
        info.isAutoplay && info.recommendationReason
            ? ` \u2014 _${info.recommendationReason}_`
            : ''
    const by = info.requestedBy ? ` \u2022 ${info.requestedBy}` : ''
    return `${marker} ${index + 1}. [${info.title}](${info.url}) - ${info.author} (${info.duration})${by}${reason}`
}

export async function createTrackListDisplay(
    tracks: Track[],
    options: QueueDisplayOptions,
    page = 0,
): Promise<string> {
    const perPage = options.maxTracksToShow
    const start = page * perPage
    const pageTracks = tracks.slice(start, start + perPage)

    const userTracks = pageTracks.filter((t) => !isAutoplayTrack(t))
    const autoTracks = pageTracks.filter((t) => isAutoplayTrack(t))

    const sections: string[] = []

    if (userTracks.length > 0) {
        const lines: string[] = []
        for (const track of userTracks) {
            const idx = tracks.indexOf(track)
            const info = await formatTrackForDisplay(track, idx, options)
            lines.push(formatSingleTrack(info, idx))
        }
        sections.push(lines.join('\n'))
    }

    if (autoTracks.length > 0) {
        if (userTracks.length > 0) {
            sections.push(
                '\u2500\u2500\u2500 \u{1F916} Autoplay Recommendations \u2500\u2500\u2500',
            )
        }
        const lines: string[] = []
        for (const track of autoTracks) {
            const idx = tracks.indexOf(track)
            const info = await formatTrackForDisplay(track, idx, options)
            lines.push(formatSingleTrack(info, idx))
        }
        sections.push(lines.join('\n'))
    }

    let result = sections.join('\n')

    if (tracks.length > start + perPage) {
        const remaining = tracks.length - (start + perPage)
        result += `\n... and ${remaining} more tracks`
    }

    return result || 'No tracks in queue'
}

export async function findSimilarTracksInQueue(
    currentTrack: Track,
    upcomingTracks: Track[],
): Promise<Track[]> {
    const similarTracks: Track[] = []

    for (const track of upcomingTracks) {
        if (await isSimilarTitle(currentTrack.title, track.title)) {
            similarTracks.push(track)
        }
    }

    return similarTracks
}

export function createQueueSummary(
    totalTracks: number,
    totalDuration: string,
    currentPosition: number,
): string {
    const summary = []

    summary.push(`**Total Tracks:** ${totalTracks}`)
    summary.push(`**Total Duration:** ${totalDuration}`)

    if (currentPosition > 0) {
        summary.push(`**Current Position:** ${formatTime(currentPosition)}`)
    }

    return summary.join(' \u2022 ')
}

function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${minutes}:${secs.toString().padStart(2, '0')}`
}
