import { warnLog } from '@lucky/shared/utils'

/**
 * Kill switch for streaming/searching via YouTube on the hosted bot.
 *
 * Defaults to enabled (unset, or anything other than a recognized "disabled"
 * value) so a self-hosted copy of the bot is unaffected. Every extractor
 * still ships in the repo; this only gates what the hosted process does with
 * them. See decisions/2026-09-27-music-first-positioning.md point 3: YouTube
 * comes off the hosted bot within 24h of a growth/notice trigger, without a
 * code change.
 *
 * The raw value is trimmed and lowercased before comparison, so "FALSE",
 * "False", and " false " all disable it the same as "false"; "0" is also
 * accepted as a disabled value. Anything else logs one startup warning (not
 * per call) and is treated as enabled, so a typo fails safe rather than
 * silently disabling YouTube for the whole hosted bot.
 *
 * A function (not a frozen constant) so it re-reads `process.env` on every
 * call: tests can flip it with `process.env.HOSTED_YOUTUBE_ENABLED` without
 * needing `jest.resetModules()`.
 */
const DISABLED_VALUES = new Set(['false', '0'])
const RECOGNIZED_VALUES = new Set(['false', '0', 'true', '1'])

let loggedUnrecognizedValue = false

// Test-only: the log-once dedup above is module-level state, so tests that
// assert on it must reset between cases instead of relying on run order.
export function __resetHostedYoutubeWarnStateForTests(): void {
    loggedUnrecognizedValue = false
}

export function isHostedYoutubeEnabled(): boolean {
    const raw = process.env.HOSTED_YOUTUBE_ENABLED
    if (raw === undefined) return true

    const normalized = raw.trim().toLowerCase()
    if (DISABLED_VALUES.has(normalized)) return false

    if (!RECOGNIZED_VALUES.has(normalized) && !loggedUnrecognizedValue) {
        loggedUnrecognizedValue = true
        warnLog({
            message:
                'HOSTED_YOUTUBE_ENABLED has an unrecognized value, treating YouTube as enabled',
            data: { value: raw },
        })
    }

    return true
}
