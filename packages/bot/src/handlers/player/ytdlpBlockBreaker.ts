import { extractionFailuresTotal } from '../../utils/monitoring/prometheus'
import { isExtractorDegraded, setExtractorDegraded } from './extractorHealth'

// Since 2026-10-06 YouTube answers yt-dlp media downloads with HTTP 403 for
// days at a time, and every play paid 4-10 s waiting for that failure before
// the SoundCloud fallback (#2653). Two 403s with no successful stream between
// them and less than FORBIDDEN_WINDOW_MS apart open this breaker, and the
// bridge skips yt-dlp for the cooldown. 'forbidden', 'botcheck', 'timeout' and
// 'empty' all count toward the streak (repeated hangs or no-output results
// mean YouTube is degraded, #2742); only 'other' neither counts nor breaks it. The window outlasts the cooldown, so a 403 on the first
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
// A timeout of the cookies retry is a budget miss, not a YouTube-wide
// signal: by then the plain attempt already got the bot-check, and a
// logged-in stream start is normally slow (5.8-7.5s against the old 8s,
// 2026-10-19 to 10-21). Counting it opened the breaker on slow starts and
// switched YouTube off for everyone (52 exhausted vs 3 plays, 10-19T23:44Z
// to 10-20T17:44Z). markYtDlpBudgetMiss tags such an error: the metric
// still counts it as 'timeout', but like 'other' it neither counts toward
// the streak nor breaks it.
//
// One play can reach yt-dlp up to three times: a cached URL then a fresh
// search (often of the same video), an empty search then the broad one, or a
// failed pass then discord-player's fallback hit. Counting each one let a
// single bad upload open the breaker for every guild. With `play`, only the
// first failure of that play that counts joins the streak; a budget miss or
// 'other' does not use up the play, so a later bot-check in it still counts.
// The metric still counts every attempt.
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
const budgetMisses = new WeakSet<object>()
const countedPlays = new WeakSet<object>()

export function markYtDlpBudgetMiss(error: unknown): void {
    if (typeof error === 'object' && error !== null) budgetMisses.add(error)
}

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

/**
 * Counts a yt-dlp failure in the Prometheus counter without updating the
 * circuit breaker. Use for failures that are immediately retried: the first
 * 403 before a retry-once attempt should be counted but must not open the
 * breaker — only a 403 that also failed the retry reaches recordYtDlpFailure.
 */
export function countYtDlpFailure(error: unknown): void {
    extractionFailuresTotal.inc({ type: classifyYtDlpFailure(error) })
}

export function recordYtDlpFailure(
    error: unknown,
    now = Date.now(),
    play?: object,
): void {
    const type = classifyYtDlpFailure(error)
    extractionFailuresTotal.inc({ type })
    // 'forbidden' and 'botcheck' are access-denial signals.
    // 'timeout' and 'empty' also count: repeated hangs or no-output results
    // indicate YouTube is degraded, not per-track issues (#2742).
    if (type === 'other') return
    if (typeof error === 'object' && error !== null && budgetMisses.has(error))
        return
    if (play) {
        if (countedPlays.has(play)) return
        countedPlays.add(play)
    }
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
