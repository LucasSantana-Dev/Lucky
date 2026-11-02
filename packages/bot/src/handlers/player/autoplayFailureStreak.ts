import { setReplenishSuppressed } from '../../services/musicManagement/replenishSuppressionStore'

// Autoplay picks that fail to stream in a row, per guild. A dead source
// (2026-10-20: yt-dlp blocked, SoundCloud only DRM or remixes) turns autoplay
// into a loop of pick, exhaust, skip every few seconds, with one channel
// message per pick. playerStart resets the count, so only an unbroken run of
// failures stops autoplay.
export const AUTOPLAY_FAILURE_STREAK_LIMIT = 3

const streaks = new Map<string, number>()

export function recordAutoplayStreamFailure(guildId: string): number {
    const count = (streaks.get(guildId) ?? 0) + 1
    streaks.set(guildId, count)
    return count
}

export function resetAutoplayFailureStreak(guildId: string): void {
    streaks.delete(guildId)
}

/**
 * Someone turned autoplay back on: forget the failures that stopped it and
 * the 1h block that came with them, or the toggle does nothing (#2932).
 */
export function resumeAutoplay(guildId: string): void {
    streaks.delete(guildId)
    setReplenishSuppressed(guildId, 0)
}
