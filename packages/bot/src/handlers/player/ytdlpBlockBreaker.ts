import { extractionFailuresTotal } from '../../utils/monitoring/prometheus'
import { setExtractorDegraded } from './extractorHealth'

// Since 2026-10-06 YouTube answers yt-dlp media downloads with HTTP 403 for
// days at a time, and every play paid 4-10 s waiting for that failure before
// the SoundCloud fallback (#2653). Two 403s with no successful stream between
// them and less than FORBIDDEN_WINDOW_MS apart open this breaker, and the
// bridge skips yt-dlp for the cooldown. Other failure types neither count nor
// break the streak. The window outlasts the cooldown, so a 403 on the first
// play after it reopens the breaker while the block lasts, but a lone
// per-video 403 long after the last one does not. A success closes it. Kept
// apart from providerHealthService on purpose: that one also orders search
// providers, and YouTube search still works while downloads are blocked.
//
// 'botcheck' (Sign in to confirm) is treated the same as 'forbidden' for
// streak and degradation purposes: both are YouTube access-denial signals
// (#2744).
export const YTDLP_BLOCK_COOLDOWN_MS = 10 * 60_000
const FORBIDDEN_THRESHOLD = 2
export const FORBIDDEN_WINDOW_MS = 15 * 60_000

export type YtDlpFailureType =
    'forbidden' | 'botcheck' | 'empty' | 'timeout' | 'other'

let consecutiveForbidden = 0
let lastForbiddenAt = 0
let blockedUntil = 0

export function classifyYtDlpFailure(error: unknown): YtDlpFailureType {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('HTTP Error 403')) return 'forbidden'
    if (message.includes('Sign in to confirm')) return 'botcheck'
    if (message.includes('exited without output')) return 'empty'
    if (message.includes('timed out')) return 'timeout'
    return 'other'
}

export function recordYtDlpFailure(error: unknown, now = Date.now()): void {
    const type = classifyYtDlpFailure(error)
    extractionFailuresTotal.inc({ type })
    if (type !== 'forbidden' && type !== 'botcheck') return
    if (now - lastForbiddenAt >= FORBIDDEN_WINDOW_MS) consecutiveForbidden = 0
    lastForbiddenAt = now
    consecutiveForbidden += 1
    if (consecutiveForbidden >= FORBIDDEN_THRESHOLD) {
        blockedUntil = now + YTDLP_BLOCK_COOLDOWN_MS
        setExtractorDegraded('youtube', true)
    }
}

export function recordYtDlpSuccess(): void {
    consecutiveForbidden = 0
    lastForbiddenAt = 0
    blockedUntil = 0
    setExtractorDegraded('youtube', false)
}

export function isYtDlpBlocked(now = Date.now()): boolean {
    return now < blockedUntil
}
