import type { User } from 'discord.js'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { getArtistTopTracks, getSimilarArtists } from '../../../lastfm'
import { createArtistTagFetcher } from './artistTagCache'
import { cleanSearchQuery } from '../../../utils/music/searchQueryCleaner'
import {
    primaryArtistKey,
    primaryArtistName,
} from '../../../utils/music/trackNormalization'
import type { AutoplayContext } from './autoplayContext'
import { normalizeTrackKey } from './scoringUtils'
import type { ScoredTrack } from './diversitySelector'
import type { AutoplayAuditCollector } from './autoplayAudit'
import { searchLastFmQuery } from './lastFmSeeder'
import { addSeedDerivedHits } from './seedDerivedHits'

// Same boost as the seed-similar spine: these picks are seed-grounded too.
const RELATED_ARTIST_BOOST = 0.25
const SEED_ARTIST_TOP_TRACKS = 5
const SEED_ARTIST_PICKS = 2
const RELATED_ARTISTS = 4
const RELATED_ARTIST_TOP_TRACKS = 3
const LOOKUP_TIMEOUT_MS = 2000
const LOOKUP_CACHE_TTL_MS = 60 * 60 * 1000
const LOOKUP_CACHE_MAX = 200

type Pick = { artist: string; title: string; weight: number }

const lookupCache = new Map<string, { value: unknown[]; expiresAt: number }>()

export function __resetRelatedArtistCacheForTests(): void {
    lookupCache.clear()
}

// Cached, time-boxed Last.fm lookup. A slow or failed call yields [] so the
// replenish pass never stalls; only non-empty results are cached.
async function cachedLookup<T>(
    key: string,
    fetcher: () => Promise<T[]>,
): Promise<T[]> {
    const now = Date.now()
    const cached = lookupCache.get(key)
    if (cached && cached.expiresAt > now) return cached.value as T[]

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)
    })
    const value = await Promise.race([
        Promise.resolve()
            .then(fetcher)
            .catch(() => null),
        timeout,
    ]).finally(() => clearTimeout(timeoutId))
    if (!value || value.length === 0) return []

    if (lookupCache.size >= LOOKUP_CACHE_MAX) {
        const oldest = lookupCache.keys().next().value
        if (oldest !== undefined) lookupCache.delete(oldest)
    }
    lookupCache.set(key, { value, expiresAt: now + LOOKUP_CACHE_TTL_MS })
    return value
}

const topTracksOf = (artist: string, limit: number) =>
    cachedLookup(`top::${artist.toLowerCase()}::${limit}`, () =>
        getArtistTopTracks(artist, limit),
    )

const isFresh = (ctx: AutoplayContext, artist: string, title: string) =>
    !ctx.excludedKeys.has(normalizeTrackKey(title, artist))

async function buildPicks(
    ctx: AutoplayContext,
    seedArtist: string,
): Promise<Pick[]> {
    const [seedTop, related] = await Promise.all([
        topTracksOf(seedArtist, SEED_ARTIST_TOP_TRACKS),
        cachedLookup(`similar::${seedArtist.toLowerCase()}`, () =>
            getSimilarArtists(seedArtist, RELATED_ARTISTS),
        ),
    ])
    const picks: Pick[] = seedTop
        .filter((t) => isFresh(ctx, t.artist, t.title))
        .slice(0, SEED_ARTIST_PICKS)
        .map((t) => ({ ...t, weight: 1 }))

    const relatedTop = await Promise.all(
        related.map((a) => topTracksOf(a.name, RELATED_ARTIST_TOP_TRACKS)),
    )
    related.forEach((a, i) => {
        const track = relatedTop[i].find((t) => isFresh(ctx, t.artist, t.title))
        if (!track) return
        const match = Math.min(Math.max(a.match, 0), 1)
        picks.push({ ...track, weight: 0.5 + 0.5 * match })
    })
    return picks
}

/**
 * Seed artist and related artists (#2961): adds the seed artist's own top
 * tracks and the top track of each Last.fm similar artist. Tagged
 * 'seed-similar' so the selector's anchor slot can pick them. Fails open:
 * an error here must never abort the replenish pass.
 */
export async function collectRelatedArtistCandidates(
    ctx: AutoplayContext,
    requestedBy: User,
    candidates: Map<string, ScoredTrack>,
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    try {
        await collectRelatedArtistCandidatesUnsafe(
            ctx,
            requestedBy,
            candidates,
            auditCollector,
        )
    } catch (error) {
        warnLog({
            message: 'Autoplay: related-artist collector failed',
            error,
        })
    }
}

async function collectRelatedArtistCandidatesUnsafe(
    ctx: AutoplayContext,
    requestedBy: User,
    candidates: Map<string, ScoredTrack>,
    auditCollector?: AutoplayAuditCollector,
): Promise<void> {
    const seed = ctx.anchorTrack ?? ctx.currentTrack
    const seedArtist = primaryArtistName(seed.author ?? '')
    if (!seedArtist) return

    const picks = await buildPicks(ctx, seedArtist)
    if (picks.length === 0) return

    const getArtistTags =
        ctx.genreContext.getArtistTags ?? createArtistTagFetcher()
    const before = candidates.size

    for (const pick of picks) {
        const query = cleanSearchQuery(pick.title, pick.artist)
        const tracks = await searchLastFmQuery(ctx.queue, query, requestedBy)
        // One track per pick, by the pick's artist: a cover or a title-only
        // match must not take the seed-similar anchor slot.
        const pickArtist = primaryArtistKey(pick.artist)
        await addSeedDerivedHits(
            ctx,
            tracks,
            candidates,
            {
                boost: RELATED_ARTIST_BOOST,
                weight: pick.weight,
                getArtistTags,
                accept: (t) => primaryArtistKey(t.author) === pickArtist,
                limit: 1,
            },
            auditCollector,
        )
    }

    debugLog({
        message: 'Autoplay: related-artist candidates collected',
        data: {
            seedArtist,
            picks: picks.length,
            added: candidates.size - before,
        },
    })
}
