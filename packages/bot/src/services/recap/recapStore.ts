import { getPrismaClient } from '@lucky/shared/utils'

// The recap columns live on guild_settings but stay out of
// GuildSettingsService and the dashboard API, like the birthday columns: the
// /recap command and the scheduler are their only writers (#2678).

/**
 * Opts a guild in, or moves an opted-in guild to another channel. A new
 * opt-in stamps `recapLastPostedAt` with now so the first recap waits for the
 * next Sunday; a channel change keeps the stamp so a due week still posts.
 * A new opt-in also marks the choice as made, so `autoEnableRecap` leaves the
 * guild alone after a later /recap off.
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
        create: {
            guildId,
            recapChannelId: channelId,
            recapLastPostedAt: now,
            recapDecidedAt: now,
        },
        update: {
            recapChannelId: channelId,
            recapLastPostedAt: now,
            recapDecidedAt: now,
        },
    })
}

/**
 * Turns the recap on in `channelId` on a guild's first successful /play
 * (#2738). Only a guild that never made a recap choice is touched: one that
 * opted in, or turned the recap off, keeps it. `recapLastPostedAt` is stamped
 * like a new opt-in, so the first recap waits for the next Sunday. Returns
 * whether the recap was turned on.
 */
export async function autoEnableRecap(
    guildId: string,
    channelId: string,
    now: Date,
): Promise<boolean> {
    const prisma = getPrismaClient()
    const data = {
        recapChannelId: channelId,
        recapLastPostedAt: now,
        recapDecidedAt: now,
    }
    // A null recapLastPostedAt also covers guilds that opted in and out
    // before recapDecidedAt existed.
    const updated = await prisma.guildSettings.updateMany({
        where: {
            guildId,
            recapDecidedAt: null,
            recapChannelId: null,
            recapLastPostedAt: null,
        },
        data,
    })
    if (updated.count > 0) return true
    const created = await prisma.guildSettings.createMany({
        data: [{ guildId, ...data }],
        skipDuplicates: true,
    })
    return created.count > 0
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
 * was read is not claimed, and a claimed week is never posted twice. A send
 * that fails for a transient reason hands the week back (`releaseRecapWeek`).
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

/**
 * Hands a claimed week back after a transient send failure, so the next tick
 * retries it. Only undoes this claim: a newer write to the row is kept.
 */
export async function releaseRecapWeek(
    guildId: string,
    claimedAt: Date,
): Promise<void> {
    await getPrismaClient().guildSettings.updateMany({
        where: { guildId, recapLastPostedAt: claimedAt },
        data: { recapLastPostedAt: null },
    })
}
