import { z } from 'zod'

export const snowflakeId = z.string().regex(/^\d{17,20}$/)

// Plain boolean check for call sites that need to validate a Discord
// snowflake before it reaches an outbound request (e.g. an ID interpolated
// into a Discord API URL), without going through the full zod parse error path.
export const isSnowflakeId = (value: string): boolean =>
    snowflakeId.safeParse(value).success

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
