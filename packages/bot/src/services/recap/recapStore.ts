import { getPrismaClient } from '@lucky/shared/utils'

// The recap columns live on guild_settings but stay out of
// GuildSettingsService and the dashboard API, like the birthday columns: the
// /recap command and the scheduler are their only writers (#2678).

/**
 * Opts a guild in. `recapLastPostedAt` is set to now so the first recap waits
 * for the next Sunday instead of posting last week's right away.
 */
export async function enableRecap(
    guildId: string,
    channelId: string,
    now: Date,
): Promise<void> {
    await getPrismaClient().guildSettings.upsert({
        where: { guildId },
        create: { guildId, recapChannelId: channelId, recapLastPostedAt: now },
        update: { recapChannelId: channelId, recapLastPostedAt: now },
    })
}

/** Opts a guild out. Returns false when it was not opted in. */
export async function disableRecap(guildId: string): Promise<boolean> {
    const result = await getPrismaClient().guildSettings.updateMany({
        where: { guildId, recapChannelId: { not: null } },
        data: { recapChannelId: null },
    })
    return result.count > 0
}

/** Opted-in guilds whose last recap is older than `boundary`. */
export async function listDueRecaps(
    boundary: Date,
): Promise<Array<{ guildId: string; channelId: string }>> {
    const rows = await getPrismaClient().guildSettings.findMany({
        where: {
            recapChannelId: { not: null },
            OR: [
                { recapLastPostedAt: null },
                { recapLastPostedAt: { lt: boundary } },
            ],
        },
        select: { guildId: true, recapChannelId: true },
    })
    return rows.flatMap((row) =>
        row.recapChannelId
            ? [{ guildId: row.guildId, channelId: row.recapChannelId }]
            : [],
    )
}

export async function markRecapPosted(
    guildId: string,
    at: Date,
): Promise<void> {
    await getPrismaClient().guildSettings.update({
        where: { guildId },
        data: { recapLastPostedAt: at },
    })
}
