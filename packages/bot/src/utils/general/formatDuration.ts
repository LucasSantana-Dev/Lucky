/**
 * Duration formatting utilities for the bot.
 */

/**
 * Clock format from a whole-second count: "M:SS", or "H:MM:SS" when >= 1 hour.
 * Clamps negative values to 0.
 * @example
 * formatDurationClock(90)    // "1:30"
 * formatDurationClock(3661)  // "1:01:01"
 * formatDurationClock(-5)    // "0:00"
 */
export function formatDurationClock(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    const hours = Math.floor(s / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    const seconds = s % 60
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Human-readable, long form: "N seconds" | "N minutes" | "N hours" | "N days".
 * @example
 * formatDurationHuman(30)    // "30 seconds"
 * formatDurationHuman(90)    // "1 minutes"
 * formatDurationHuman(3600)  // "1 hours"
 * formatDurationHuman(86400) // "1 days"
 */
export function formatDurationHuman(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`
    return `${Math.floor(seconds / 86400)} days`
}
