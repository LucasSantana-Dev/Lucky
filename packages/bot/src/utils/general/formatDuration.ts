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
 * formatDurationClock(NaN)   // "0:00"
 */
export function formatDurationClock(totalSeconds: number): string {
    const s = Number.isFinite(totalSeconds)
        ? Math.max(0, Math.floor(totalSeconds))
        : 0
    const hours = Math.floor(s / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    const seconds = s % 60
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Human-readable, long form with correct singular/plural units.
 * Non-finite or negative input is treated as 0.
 * @example
 * formatDurationHuman(30)    // "30 seconds"
 * formatDurationHuman(60)    // "1 minute"
 * formatDurationHuman(90)    // "1 minute"
 * formatDurationHuman(3600)  // "1 hour"
 * formatDurationHuman(86400) // "1 day"
 */
export function formatDurationHuman(seconds: number): string {
    const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
    const unit = (n: number, label: string): string =>
        `${n} ${label}${n === 1 ? '' : 's'}`
    if (s < 60) return unit(s, 'second')
    if (s < 3600) return unit(Math.floor(s / 60), 'minute')
    if (s < 86400) return unit(Math.floor(s / 3600), 'hour')
    return unit(Math.floor(s / 86400), 'day')
}
