import type { Track } from 'discord-player'
import { errorLog } from '../general/log'

// Helper function to format duration
export const formatDuration = (duration: string): string => {
    try {
        const match = duration.match(/^(\d+):(\d+)$/)
        if (match !== null && match !== undefined) {
            const minutes = parseInt(match[1])
            const seconds = parseInt(match[2])
            return `${minutes}:${seconds.toString().padStart(2, '0')}`
        }
        return duration
    } catch (error) {
        errorLog({ message: 'Error formatting duration:', error })
        return 'Unknown'
    }
}

/**
 * Get track title safely
 */
function getTrackTitle(track: Track): string {
    return track?.title ?? 'Unknown song'
}

/**
 * Get track duration safely
 */
function getTrackDuration(track: Track): string {
    return track?.duration ? formatDuration(track.duration) : 'Unknown'
}

/**
 * Get track requester safely
 */
function getTrackRequester(track: Track): string {
    return track?.requestedBy?.username ?? 'Unknown'
}

/**
 * Get track URL safely
 */
function getTrackUrl(track: Track): string {
    return track?.url ?? ''
}

/**
 * Get default track info
 */
function getDefaultTrackInfo() {
    return {
        title: 'Unknown song',
        duration: 'Unknown',
        requestedBy: 'Unknown',
        url: '',
    }
}

// Helper function to safely get track properties
export const getTrackInfo = (track: Track) => {
    try {
        return {
            title: getTrackTitle(track),
            duration: getTrackDuration(track),
            requestedBy: getTrackRequester(track),
            url: getTrackUrl(track),
        }
    } catch (error) {
        errorLog({ message: 'Error getting track info:', error })
        return getDefaultTrackInfo()
    }
}
