import type { Track, GuildQueue } from 'discord-player'
import type { TrackValidationResult, TrackManagementOptions } from './types'
import { debugLog } from '@lukbot/shared/utils'
import { calculateTrackSimilarity, calculateTrackQuality } from './trackSimilarity'

function checkForDuplicates(track: Track, queue: GuildQueue, threshold: number): boolean {
    for (const queueTrack of queue.tracks.toArray()) {
        if (calculateTrackSimilarity(track, queueTrack) >= threshold) return true
    }
    return false
}

export function validateTrack(track: Track, queue: GuildQueue, options: TrackManagementOptions): TrackValidationResult {
    try {
        if (!track || !track.title || !track.url) return { isValid: false, reason: 'Invalid track data' }

        const duration = typeof track.duration === 'number' ? track.duration : parseInt(track.duration.toString())
        if (duration > 600000) return { isValid: false, reason: 'Track too long (max 10 minutes)' }
        if (duration < 30000) return { isValid: false, reason: 'Track too short (min 30 seconds)' }

        if (!options.allowDuplicates) {
            if (checkForDuplicates(track, queue, options.duplicateThreshold || 0.8)) {
                return { isValid: false, reason: 'Duplicate track detected' }
            }
        }

        return { isValid: true, score: calculateTrackQuality(track) }
    } catch (error) {
        debugLog({ message: 'Error validating track:', error })
        return { isValid: false, reason: 'Validation error' }
    }
}

export function validateTracks(
    tracks: Track[], queue: GuildQueue, options: TrackManagementOptions
): { validTracks: Track[], invalidTracks: Track[], results: TrackValidationResult[] } {
    const validTracks: Track[] = []
    const invalidTracks: Track[] = []
    const results: TrackValidationResult[] = []

    for (const track of tracks) {
        const result = validateTrack(track, queue, options)
        results.push(result)
        if (result.isValid) validTracks.push(track)
        else invalidTracks.push(track)
    }

    return { validTracks, invalidTracks, results }
}
