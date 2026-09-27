/**
 * Kill switch for streaming/searching via YouTube on the hosted bot.
 *
 * Defaults to enabled (unset, or anything other than the literal string
 * "false") so a self-hosted copy of the bot is unaffected. Every extractor
 * still ships in the repo; this only gates what the hosted process does with
 * them. See decisions/2026-09-27-music-first-positioning.md point 3: YouTube
 * comes off the hosted bot within 24h of a growth/notice trigger, without a
 * code change.
 *
 * A function (not a frozen constant) so it re-reads `process.env` on every
 * call: tests can flip it with `process.env.HOSTED_YOUTUBE_ENABLED` without
 * needing `jest.resetModules()`.
 */
export function isHostedYoutubeEnabled(): boolean {
    return process.env.HOSTED_YOUTUBE_ENABLED !== 'false'
}
