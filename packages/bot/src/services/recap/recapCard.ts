import { getRecapCardTracks } from '@lucky/shared/services'
import type { RecapPayload } from '@lucky/shared/services'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { fetchCovers, sanitizeCardText, type CoverStats } from './recapCovers'
import { startLoopLagProbe } from './recapLoopLag'
import { requestRecapCard, type RenderResult } from './recapRenderClient'

export type RecapCardTrack = {
    title: string
    author: string
    plays: number
    cover?: string
}

/** Request body of `POST /render/recap`; mirrors packages/render/schema/recap.schema.json. */
export type RecapCardPayload = {
    schemaVersion: 1
    guildId: string
    from: string
    to: string
    plays: number
    skips: number
    autoplayPlays: number
    listenedSeconds: number
    topTracks: RecapCardTrack[]
    topArtists: Array<{ name: string; plays: number }>
}

type CardDeps = {
    fetch?: typeof fetch
    getCardTracks?: typeof getRecapCardTracks
    renderBaseUrl?: string
}

/**
 * Builds the card request: the embed's aggregate plus up to 25 top tracks with
 * covers. Built field by field so nothing outside the schema leaks in. A failed
 * cover or card-track query degrades to fewer covers, never to an error.
 */
export async function buildRecapCardPayload(
    recap: RecapPayload,
    deps: CardDeps = {},
): Promise<RecapCardPayload> {
    let tracks: Array<{
        title: string
        author: string
        plays: number
        thumbnail?: string | null
    }> = recap.topTracks
    const queryStarted = Date.now()
    const stopQueryProbe = startLoopLagProbe()
    try {
        tracks = await (deps.getCardTracks ?? getRecapCardTracks)(
            recap.guildId,
            new Date(recap.from),
            new Date(recap.to),
        )
    } catch (error) {
        warnLog({
            message: 'recap card: track query failed, using the embed list',
            data: {
                guildId: recap.guildId,
                error: error instanceof Error ? error.message : String(error),
            },
        })
    }
    const trackQueryMs = Date.now() - queryStarted
    const queryLag = await stopQueryProbe()

    // Tracks often share art (an album): fetch each URL once and map the
    // result back so covers[i] stays aligned with tracks[i].
    const unique = [
        ...new Set(tracks.map((t) => t.thumbnail).filter(Boolean)),
    ] as string[]
    const stats: CoverStats = { timedOut: 0, skipped: 0 }
    const started = Date.now()
    const stopCoverProbe = startLoopLagProbe()
    const fetched = await fetchCovers(unique, { fetch: deps.fetch, stats })
    const durationMs = Date.now() - started
    const coverLag = await stopCoverProbe()
    const byUrl = new Map(unique.map((url, i) => [url, fetched[i]]))
    const covers = tracks.map((t) =>
        t.thumbnail ? (byUrl.get(t.thumbnail) ?? null) : null,
    )

    // Counts and timing only: no URLs or titles in logs. Info level so a
    // weekly run shows in Loki whether covers dropped and how long it took.
    // Loop lag tells a blocked bot (timers firing late, #3309) from a slow
    // CDN: high lag with timeouts means the bot, low lag means the network.
    const wanted = tracks.filter((t) => t.thumbnail).length
    const got = covers.filter(Boolean).length
    infoLog({
        message: 'recap card: covers fetched',
        data: {
            guildId: recap.guildId,
            wanted,
            got,
            dropped: wanted - got,
            coverUrls: unique.length,
            urlsTimedOut: stats.timedOut,
            urlsSkipped: stats.skipped,
            durationMs,
            loopLagMaxMs: coverLag.maxMs,
            loopLagP99Ms: coverLag.p99Ms,
            trackQueryMs,
            trackQueryLoopLagMaxMs: queryLag.maxMs,
        },
    })

    return {
        schemaVersion: 1,
        guildId: recap.guildId,
        from: recap.from,
        to: recap.to,
        plays: recap.plays,
        skips: recap.skips,
        autoplayPlays: recap.autoplayPlays,
        listenedSeconds: recap.listenedSeconds,
        topTracks: tracks.map((t, i) => {
            const track: RecapCardTrack = {
                title: sanitizeCardText(t.title),
                author: sanitizeCardText(t.author),
                plays: t.plays,
            }
            const cover = covers[i]
            if (cover) track.cover = cover
            return track
        }),
        topArtists: recap.topArtists.map((a) => ({
            name: sanitizeCardText(a.name),
            plays: a.plays,
        })),
    }
}

/** Builds the payload and asks the sidecar for the JPEG. Never throws. */
export async function renderRecapCard(
    recap: RecapPayload,
    deps: CardDeps = {},
): Promise<RenderResult> {
    try {
        const payload = await buildRecapCardPayload(recap, deps)
        return await requestRecapCard(payload, {
            fetch: deps.fetch,
            baseUrl: deps.renderBaseUrl,
        })
    } catch (error) {
        // Never the payload: only the guild and the error.
        warnLog({
            message: 'recap card: unexpected error building or requesting',
            data: {
                guildId: recap.guildId,
                error: error instanceof Error ? error.message : String(error),
            },
        })
        return { ok: false, reason: 'bad_response' }
    }
}
