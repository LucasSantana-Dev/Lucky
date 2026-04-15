import { z } from 'zod'

const snowflakeId = z.string().regex(/^\d{17,20}$/)

export const guildIdParam = z.object({
    guildId: snowflakeId,
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
