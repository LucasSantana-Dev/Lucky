import type { Track } from 'discord-player'
import { getTrackInfo } from '../../../../utils/music/trackUtils'
import { isSimilarTitle } from '../../../../utils/music/titleComparison'
import type { TrackDisplayInfo, QueueDisplayOptions } from './types'

/**
 * Format track information for display
 */
export async function formatTrackForDisplay(
    track: Track,
    position: number,
    _options: QueueDisplayOptions,
): Promise<TrackDisplayInfo> {
    const trackInfo = await getTrackInfo(track)

    return {
        title: track.title,
        author: track.author,
        url: track.url,
        duration: trackInfo.duration || 'Unknown',
        thumbnail: track.thumbnail,
        requestedBy: track.requestedBy?.username,
        position,
    }
}

/**
 * Create track list display string
 */
export async function createTrackListDisplay(
    tracks: Track[],
    options: QueueDisplayOptions,
): Promise<string> {
    const displayTracks = tracks.slice(0, options.maxTracksToShow)
    const trackDisplays = []

    for (let i = 0; i < displayTracks.length; i++) {
        const track = displayTracks[i]
        const trackInfo = await formatTrackForDisplay(track, i + 1, options)

        const trackDisplay = `${i + 1}. [${trackInfo.title}](${trackInfo.url}) - ${trackInfo.author} (${trackInfo.duration})`
        trackDisplays.push(trackDisplay)
    }

    let result = trackDisplays.join('\n')

    if (tracks.length > options.maxTracksToShow) {
        result += `\n... and ${tracks.length - options.maxTracksToShow} more tracks`
    }

    return result
}

/**
 * Check for similar tracks in queue
 */
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

/**
 * Create queue summary
 */
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

    return summary.join(' • ')
}

/**
 * Format time in seconds to readable format
 */
function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${minutes}:${secs.toString().padStart(2, '0')}`
}
