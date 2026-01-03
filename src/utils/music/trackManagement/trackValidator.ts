import type { Track, GuildQueue } from 'discord-player'
import type { TrackValidationResult, TrackManagementOptions } from './types'
import { debugLog } from '../../general/log'

/**
 * Validate a track before adding to queue
 */
export function validateTrack(
    track: Track,
    queue: GuildQueue,
    options: TrackManagementOptions
): TrackValidationResult {
    try {
        // Check if track is valid
        if (!track || !track.title || !track.url) {
            return {
                isValid: false,
                reason: 'Invalid track data'
            }
        }

        // Check duration limits
        const duration = typeof track.duration === 'number' ? track.duration : parseInt(track.duration.toString())
        if (duration > 600000) { // 10 minutes
            return {
                isValid: false,
                reason: 'Track too long (max 10 minutes)'
            }
        }

        if (duration < 30000) { // 30 seconds
            return {
                isValid: false,
                reason: 'Track too short (min 30 seconds)'
            }
        }

        // Check for duplicates if not allowed
        if (!options.allowDuplicates) {
            const isDuplicate = checkForDuplicates(track, queue, options.duplicateThreshold || 0.8)
            if (isDuplicate) {
                return {
                    isValid: false,
                    reason: 'Duplicate track detected'
                }
            }
        }

        // Calculate quality score
        const score = calculateTrackQuality(track)

        return {
            isValid: true,
            score
        }
    } catch (error) {
        debugLog({ message: 'Error validating track:', error })
        return {
            isValid: false,
            reason: 'Validation error'
        }
    }
}

/**
 * Check for duplicate tracks in queue
 */
function checkForDuplicates(
    track: Track,
    queue: GuildQueue,
    threshold: number
): boolean {
    const queueTracks = queue.tracks.toArray()

    for (const queueTrack of queueTracks) {
        const similarity = calculateTrackSimilarity(track, queueTrack)
        if (similarity >= threshold) {
            return true
        }
    }

    return false
}

/**
 * Calculate similarity between two tracks
 */
function calculateTrackSimilarity(trackA: Track, trackB: Track): number {
    let similarity = 0

    // Title similarity
    const titleSim = calculateStringSimilarity(trackA.title, trackB.title)
    similarity += titleSim * 0.4

    // Artist similarity
    const artistSim = calculateStringSimilarity(trackA.author, trackB.author)
    similarity += artistSim * 0.3

    // Duration similarity
    const durationSim = calculateDurationSimilarity(trackA.duration, trackB.duration)
    similarity += durationSim * 0.2

    // URL similarity (exact match)
    if (trackA.url === trackB.url) {
        similarity += 0.1
    }

    return similarity
}

/**
 * Calculate string similarity using Jaccard index
 */
function calculateStringSimilarity(strA: string, strB: string): number {
    const wordsA = strA.toLowerCase().split(/\s+/)
    const wordsB = strB.toLowerCase().split(/\s+/)

    const setA = new Set(wordsA)
    const setB = new Set(wordsB)

    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return intersection.size / union.size
}

/**
 * Calculate duration similarity
 */
function calculateDurationSimilarity(durationA: number | string, durationB: number | string): number {
    const numA = typeof durationA === 'number' ? durationA : parseInt(durationA.toString())
    const numB = typeof durationB === 'number' ? durationB : parseInt(durationB.toString())

    if (numA === 0 || numB === 0) {
        return 0
    }

    const ratio = Math.min(numA, numB) / Math.max(numA, numB)
    return ratio
}

/**
 * Calculate track quality score
 */
function calculateTrackQuality(track: Track): number {
    let score = 0.5 // Base score

    // Title quality
    if (track.title.length > 10 && track.title.length < 100) {
        score += 0.1
    }

    // Artist quality
    if (track.author && track.author.length > 2) {
        score += 0.1
    }

    // Duration quality (prefer tracks between 2-8 minutes)
    const duration = typeof track.duration === 'number' ? track.duration : parseInt(track.duration.toString())
    if (duration >= 120000 && duration <= 480000) {
        score += 0.2
    }

    // Thumbnail quality
    if (track.thumbnail && track.thumbnail.length > 0) {
        score += 0.1
    }

    // Views quality (if available)
    if (track.views && track.views > 1000) {
        score += 0.1
    }

    return Math.min(score, 1.0)
}

/**
 * Validate multiple tracks
 */
export function validateTracks(
    tracks: Track[],
    queue: GuildQueue,
    options: TrackManagementOptions
): { validTracks: Track[], invalidTracks: Track[], results: TrackValidationResult[] } {
    const validTracks: Track[] = []
    const invalidTracks: Track[] = []
    const results: TrackValidationResult[] = []

    for (const track of tracks) {
        const result = validateTrack(track, queue, options)
        results.push(result)

        if (result.isValid) {
            validTracks.push(track)
        } else {
            invalidTracks.push(track)
        }
    }

    return { validTracks, invalidTracks, results }
}
