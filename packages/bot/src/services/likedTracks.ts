import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { errorLog, getPrismaClient } from '@lucky/shared/utils'
import { isHostedYoutubeEnabled } from '../config/featureFlags'
import { textSearchBlockOptions } from '../functions/music/commands/play/handlers/resolveProvider'
import { isHost } from '../utils/general/urlHost'
import { normalizeTrackKey } from '../utils/music/trackNormalization'
import { toSnapshotTrack } from './musicRecommendation/sessionSnapshots'

export const LIKED_TRACKS_MAX = 500
/** How many liked songs one `/liked play` adds to the queue. */
export const LIKED_PLAY_BATCH = 25

export type LikedTrack = {
    id: string
    title: string
    author: string
    url: string
    duration: string
}

export type LikeResult = 'saved' | 'already' | 'full' | 'failed'

const LIKED_FIELDS = {
    id: true,
    title: true,
    author: true,
    url: true,
    duration: true,
} as const

/** Saves a track to the member's liked songs, once per song. */
export async function likeTrack(
    userId: string,
    track: Track,
): Promise<LikeResult> {
    try {
        const prisma = getPrismaClient()
        const snapshot = toSnapshotTrack(track)
        const trackKey = normalizeTrackKey(snapshot.title, snapshot.author)
        const where = {
            discordUserId_trackKey: { discordUserId: userId, trackKey },
        }
        if (await prisma.likedTrack.findUnique({ where, select: { id: true } }))
            return 'already'
        const count = await prisma.likedTrack.count({
            where: { discordUserId: userId },
        })
        if (count >= LIKED_TRACKS_MAX) return 'full'
        // Upsert, so two quick /like calls for one song cannot collide.
        const saved = await prisma.likedTrack.upsert({
            where,
            update: {},
            create: {
                discordUserId: userId,
                trackKey,
                title: snapshot.title,
                author: snapshot.author,
                url: snapshot.url,
                duration: snapshot.duration,
                source: snapshot.source,
            },
            select: { id: true },
        })
        // Two likes of different songs can both pass the count above, so the
        // limit is checked again with the row in place and the row taken back
        // when it went over.
        const after = await prisma.likedTrack.count({
            where: { discordUserId: userId },
        })
        if (after > LIKED_TRACKS_MAX) {
            await prisma.likedTrack.deleteMany({ where: { id: saved.id } })
            return 'full'
        }
        return 'saved'
    } catch (error) {
        errorLog({ message: 'Failed to save a liked track', error })
        return 'failed'
    }
}

/**
 * The member's liked songs, newest first, with the total they have. Null when
 * the read failed, so a database outage is not shown as an empty list.
 */
export async function listLikedTracks(
    userId: string,
    limit: number,
): Promise<{ tracks: LikedTrack[]; total: number } | null> {
    try {
        const prisma = getPrismaClient()
        const where = { discordUserId: userId }
        const [tracks, total] = await Promise.all([
            prisma.likedTrack.findMany({
                where,
                orderBy: { likedAt: 'desc' },
                take: limit,
                select: LIKED_FIELDS,
            }),
            prisma.likedTrack.count({ where }),
        ])
        return { tracks, total }
    } catch (error) {
        errorLog({ message: 'Failed to list liked tracks', error })
        return null
    }
}

/** Liked songs whose title or artist contains the typed text, newest first. */
export async function findLikedTracks(
    userId: string,
    typed: string,
    limit: number,
): Promise<LikedTrack[]> {
    try {
        const text = typed.trim()
        return await getPrismaClient().likedTrack.findMany({
            where: {
                discordUserId: userId,
                ...(text
                    ? {
                          OR: [
                              {
                                  title: {
                                      contains: text,
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  author: {
                                      contains: text,
                                      mode: 'insensitive' as const,
                                  },
                              },
                          ],
                      }
                    : {}),
            },
            orderBy: { likedAt: 'desc' },
            take: limit,
            select: LIKED_FIELDS,
        })
    } catch (error) {
        errorLog({ message: 'Failed to search liked tracks', error })
        return []
    }
}

/** Removes one of the member's own liked songs by id; null when not theirs. */
export async function unlikeTrack(
    userId: string,
    id: string,
): Promise<LikedTrack | null> {
    try {
        const prisma = getPrismaClient()
        const track = await prisma.likedTrack.findFirst({
            where: { id, discordUserId: userId },
            select: LIKED_FIELDS,
        })
        if (!track) return null
        await prisma.likedTrack.deleteMany({
            where: { id, discordUserId: userId },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Failed to remove a liked track', error })
        return null
    }
}

function shuffled<T>(items: T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

/**
 * Adds a shuffled batch of the given liked songs to the queue and starts
 * playback when no song is on. `missed` counts the songs of the batch that no
 * source could find.
 */
export async function queueLikedTracks(
    queue: GuildQueue,
    user: User,
    liked: LikedTrack[],
): Promise<{ added: number; missed: number }> {
    const batch = shuffled(liked).slice(0, LIKED_PLAY_BATCH)

    let added = 0
    let missed = 0
    for (const song of batch) {
        // No YouTube extractor is registered when hosted YouTube is off, so
        // such a link is looked up by title and artist on the other sources.
        const youtubeLink =
            !isHostedYoutubeEnabled() &&
            isHost(song.url, 'youtube.com', 'youtu.be')
        const query =
            song.url && !youtubeLink
                ? song.url
                : `${song.title} ${song.author}`.trim()
        try {
            const result = await queue.player.search(query, {
                requestedBy: user,
                searchEngine: QueryType.AUTO,
                ...textSearchBlockOptions(query),
            })
            const track = result.tracks[0]
            if (!track) {
                missed += 1
                continue
            }
            queue.addTrack(track)
            added += 1
        } catch (error) {
            missed += 1
            errorLog({ message: 'Failed to look up a liked track', error })
        }
    }

    // A paused song stays paused: only an idle queue is started.
    if (added > 0 && !queue.currentTrack) await queue.node.play()
    return { added, missed }
}
