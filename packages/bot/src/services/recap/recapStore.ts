import { getPrismaClient } from '@lucky/shared/utils'

// The recap columns live on guild_settings but stay out of
// GuildSettingsService and the dashboard API, like the birthday columns: the
// /recap command and the scheduler are their only writers (#2678).

/**
 * Opts a guild in, or moves an opted-in guild to another channel. A new
 * opt-in stamps `recapLastPostedAt` with now so the first recap waits for the
 * next Sunday; a channel change keeps the stamp so a due week still posts.
 */
export async function enableRecap(
    guildId: string,
    channelId: string,
    now: Date,
): Promise<void> {
    const prisma = getPrismaClient()
    const moved = await prisma.guildSettings.updateMany({
        where: { guildId, recapChannelId: { not: null } },
        data: { recapChannelId: channelId },
    })
    if (moved.count > 0) return
    await prisma.guildSettings.upsert({
        where: { guildId },
        create: { guildId, recapChannelId: channelId, recapLastPostedAt: now },
        update: { recapChannelId: channelId, recapLastPostedAt: now },
    })
}

/**
 * Opts a guild out. Returns false when it was not opted in. With `channelId`,
 * only clears that channel, so a channel picked meanwhile survives.
 */
export async function disableRecap(
    guildId: string,
    channelId?: string,
): Promise<boolean> {
    const result = await getPrismaClient().guildSettings.updateMany({
        where: { guildId, recapChannelId: channelId ?? { not: null } },
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

/**
 * Claims the week ending at `boundary` before posting it: one conditional
 * write, so a guild that turned the recap off or moved it since the due list
 * was read is not claimed, and a claimed week is never posted twice (at most
 * once: a send that fails after the claim loses that week).
 */
export async function claimRecapWeek(
    guildId: string,
    channelId: string,
    boundary: Date,
    now: Date,
): Promise<boolean> {
    const result = await getPrismaClient().guildSettings.updateMany({
        where: {
            guildId,
            recapChannelId: channelId,
            OR: [
                { recapLastPostedAt: null },
                { recapLastPostedAt: { lt: boundary } },
            ],
        },
        data: { recapLastPostedAt: now },
    })
    return result.count > 0
}
