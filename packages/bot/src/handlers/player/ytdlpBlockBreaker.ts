import { extractionFailuresTotal } from '../../utils/monitoring/prometheus'
import { isExtractorDegraded, setExtractorDegraded } from './extractorHealth'

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
// 'botcheck' ("Sign in to confirm you're not a bot") is treated the same as
// 'forbidden' for streak and degradation purposes: both are YouTube
// access-denial signals (#2744). The age gate ("Sign in to confirm your age")
// is per-video and stays 'other'.
//
// The breaker only clears the youtube degraded gauge it set itself, so a
// boot-time registration failure (playerFactory) is never cleared by a
// later yt-dlp success. The gauge clears when the block expires, even if
// the bot is idle.
export const YTDLP_BLOCK_COOLDOWN_MS = 10 * 60_000
const FORBIDDEN_THRESHOLD = 2
export const FORBIDDEN_WINDOW_MS = 15 * 60_000

export type YtDlpFailureType =
    'forbidden' | 'botcheck' | 'empty' | 'timeout' | 'other'

let consecutiveForbidden = 0
let lastForbiddenAt = 0
let blockedUntil = 0
let degradedByBreaker = false
let expiryTimer: ReturnType<typeof setTimeout> | undefined

export function classifyYtDlpFailure(error: unknown): YtDlpFailureType {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('HTTP Error 403')) return 'forbidden'
    if (/Sign in to confirm you.re not a bot/.test(message)) return 'botcheck'
    if (message.includes('exited without output')) return 'empty'
    if (message.includes('timed out')) return 'timeout'
    return 'other'
}

function clearBreakerDegraded(): void {
    clearTimeout(expiryTimer)
    expiryTimer = undefined
    if (!degradedByBreaker) return
    degradedByBreaker = false
    setExtractorDegraded('youtube', false)
}

function markBreakerDegraded(): void {
    clearTimeout(expiryTimer)
    expiryTimer = setTimeout(() => isYtDlpBlocked(), YTDLP_BLOCK_COOLDOWN_MS)
    expiryTimer.unref?.()
    if (degradedByBreaker || isExtractorDegraded('youtube')) return
    degradedByBreaker = true
    setExtractorDegraded('youtube', true)
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
        markBreakerDegraded()
    }
}

export function recordYtDlpSuccess(): void {
    consecutiveForbidden = 0
    lastForbiddenAt = 0
    blockedUntil = 0
    clearBreakerDegraded()
}

export function isYtDlpBlocked(now = Date.now()): boolean {
    if (now < blockedUntil) return true
    clearBreakerDegraded()
    return false
}
