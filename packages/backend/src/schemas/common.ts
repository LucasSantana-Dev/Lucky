import { z } from 'zod'

const SNOWFLAKE_PATTERN = /^\d{17,20}$/

export const snowflakeId = z.string().regex(SNOWFLAKE_PATTERN)

// Plain anchored regex test (not zod) so static analysis sees it as a
// sanitizer for Discord API URLs built from these ids.
export const isSnowflakeId = (value: unknown): value is string =>
    typeof value === 'string' && SNOWFLAKE_PATTERN.test(value)

export const guildIdParam = z.object({
    guildId: snowflakeId,
})

export const idParam = z.object({
    id: snowflakeId,
})

export const userIdParam = z.object({
    userId: snowflakeId,
})

export const channelIdSchema = snowflakeId.regex(/^\d{17,20}$/).optional()

export const discordIdValidation = {
    guildId: snowflakeId,
    userId: snowflakeId,
    channelId: snowflakeId,
}
