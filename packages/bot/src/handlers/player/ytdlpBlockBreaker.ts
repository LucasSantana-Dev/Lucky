import { extractionFailuresTotal } from '../../utils/monitoring/prometheus'

// Since 2026-10-06 YouTube answers yt-dlp media downloads with HTTP 403 for
// days at a time, and every play paid 4-10 s waiting for that failure before
// the SoundCloud fallback (#2653). Two consecutive 403s open this breaker and
// the bridge skips yt-dlp for the cooldown; the first play after it probes
// YouTube again, and a success closes it. Kept apart from
// providerHealthService on purpose: that one also orders search providers,
// and YouTube search still works while downloads are blocked.
export const YTDLP_BLOCK_COOLDOWN_MS = 10 * 60_000
const FORBIDDEN_THRESHOLD = 2

export type YtDlpFailureType = 'forbidden' | 'empty' | 'timeout' | 'other'

let consecutiveForbidden = 0
let blockedUntil = 0

export function classifyYtDlpFailure(error: unknown): YtDlpFailureType {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('HTTP Error 403')) return 'forbidden'
    if (message.includes('exited without output')) return 'empty'
    if (message.includes('timed out')) return 'timeout'
    return 'other'
}

export function recordYtDlpFailure(error: unknown, now = Date.now()): void {
    const type = classifyYtDlpFailure(error)
    extractionFailuresTotal.inc({ type })
    if (type !== 'forbidden') return
    consecutiveForbidden += 1
    if (consecutiveForbidden >= FORBIDDEN_THRESHOLD) {
        blockedUntil = now + YTDLP_BLOCK_COOLDOWN_MS
    }
}

export function recordYtDlpSuccess(): void {
    consecutiveForbidden = 0
    blockedUntil = 0
}

export function isYtDlpBlocked(now = Date.now()): boolean {
    return now < blockedUntil
}
