import type { Track } from 'discord-player'
import { jaccardSimilarity } from '@lucky/shared/utils'

export function calculateTrackSimilarity(trackA: Track, trackB: Track): number {
    let similarity = 0
    similarity += jaccardSimilarity(trackA.title, trackB.title) * 0.4
    similarity += jaccardSimilarity(trackA.author, trackB.author) * 0.3
    similarity += calculateDurationSimilarity(trackA.duration, trackB.duration) * 0.2
    if (trackA.url === trackB.url) similarity += 0.1
    return similarity
}

export function calculateDurationSimilarity(durationA: number | string, durationB: number | string): number {
    const numA = typeof durationA === 'number' ? durationA : parseInt(durationA.toString())
    const numB = typeof durationB === 'number' ? durationB : parseInt(durationB.toString())
    if (numA === 0 || numB === 0) return 0
    return Math.min(numA, numB) / Math.max(numA, numB)
}

export function calculateTrackQuality(track: Track): number {
    let score = 0.5
    if (track.title.length > 10 && track.title.length < 100) score += 0.1
    if (track.author && track.author.length > 2) score += 0.1
    const duration = typeof track.duration === 'number' ? track.duration : parseInt(track.duration.toString())
    if (duration >= 120000 && duration <= 480000) score += 0.2
    if (track.thumbnail && track.thumbnail.length > 0) score += 0.1
    if (track.views && track.views > 1000) score += 0.1
    return Math.min(score, 1.0)
}
