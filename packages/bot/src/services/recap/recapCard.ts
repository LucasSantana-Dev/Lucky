import { getRecapCardTracks } from '@lucky/shared/services'
import type { RecapPayload } from '@lucky/shared/services'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { fetchCovers, sanitizeCardText } from './recapCovers'
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

    const covers = await fetchCovers(
        tracks.map((t) => t.thumbnail),
        { fetch: deps.fetch },
    )

    // Counts only: no URLs or titles in logs.
    const wanted = tracks.filter((t) => t.thumbnail).length
    const got = covers.filter(Boolean).length
    debugLog({
        message: 'recap card: covers fetched',
        data: { guildId: recap.guildId, wanted, got, dropped: wanted - got },
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
    } catch {
        return { ok: false, reason: 'bad_response' }
    }
}
