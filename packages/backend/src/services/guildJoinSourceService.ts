import { getPrismaClient } from '@lucky/shared/utils'

const SNOWFLAKE = /^\d{17,20}$/

/**
 * Record where a guild add came from (#2750). First source wins: a later add
 * of the same guild keeps the original row. Returns false (and writes
 * nothing) when the guild id is not a snowflake.
 */
export async function recordGuildJoinSource(
    guildId: unknown,
    source: string,
): Promise<boolean> {
    if (typeof guildId !== 'string' || !SNOWFLAKE.test(guildId)) return false

    await getPrismaClient().guildJoinSource.upsert({
        where: { guildDiscordId: guildId },
        create: { guildDiscordId: guildId, source },
        update: {},
    })
    return true
}
