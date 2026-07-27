/**
 * Redis key holding the bot's live total member reach (sum of `memberCount`
 * across all guilds). Published by the bot's stats scheduler and read by
 * `GET /api/stats/public` so the public stat reflects real reach rather than the
 * `User` table (which only holds dashboard-registered users).
 */
export const BOT_STATS_MEMBERS_KEY = 'bot:stats:totalMembers'

/**
 * TTL (seconds) for {@link BOT_STATS_MEMBERS_KEY}. Longer than 3× the scheduler
 * tick (30 min) so a brief bot restart doesn't zero the public stat, but a bot
 * that stays down eventually lets the key expire instead of showing a frozen number.
 */
export const BOT_STATS_TTL_SECONDS = 90 * 60
