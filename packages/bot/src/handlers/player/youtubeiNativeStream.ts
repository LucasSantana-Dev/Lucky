import type { Readable } from 'node:stream'
import { isHostedYoutubeEnabled } from '../../config/featureFlags'
import { withTimeout } from './withTimeout'
import type { YtSearchCandidate } from './ytdlpProcess'

// Second YouTube client for the bridge, independent of the yt-dlp binary:
// youtubei.js (the Innertube instance discord-player-youtubei creates when it
// activates) plus simple-ytdl-core's multi-client adaptive download, which
// mints a po_token through bgutils-js when a client needs one. This is what
// YoutubeExtractor.stream() would run by default; our createStream override
// replaces it, so the bridge calls it as a stage instead.
//
// Both packages ship ESM only, so they are loaded on first use rather than
// imported at the top (ts-jest's CommonJS transform cannot load them, and
// the bridge spec mocks this module whole).

// Innertube search is one HTTP round trip (measured ~0.6 s).
export const YOUTUBEI_SEARCH_TIMEOUT_MS = 4_000
// Stream start includes the player request and, on the first po_token
// client, a BotGuard challenge in jsdom: give it the yt-dlp stream budget.
export const YOUTUBEI_STREAM_TIMEOUT_MS = 8_000

const KILL_SWITCH_ERROR = 'youtubei: YouTube disabled (HOSTED_YOUTUBE_ENABLED)'

type SearchVideoNode = {
    video_id?: unknown
    title?: { toString(): string }
    author?: { name?: string }
    duration?: { seconds?: number }
}

async function getTube() {
    const { getInnertube } = await import('discord-player-youtubei')
    // Returns the singleton the registered extractor already created; the
    // empty options object is required (getInnertube reads options.cookie).
    return getInnertube({})
}

// A stream that resolves after the timeout already lost the race: destroy it
// so the download does not keep running with nobody reading it.
function destroyLateStream(pending: Promise<Readable>): void {
    pending.then(
        (late) => late.destroy(),
        () => undefined,
    )
}

/** Starts the audio stream of one YouTube video through youtubei.js. */
export async function streamViaYoutubei(videoId: string): Promise<Readable> {
    if (!isHostedYoutubeEnabled()) throw new Error(KILL_SWITCH_ERROR)
    const pending = (async () => {
        const tube = await getTube()
        const { createAdaptiveStreamMultiStep } =
            await import('simple-ytdl-core')
        return createAdaptiveStreamMultiStep(tube, videoId)
    })()
    try {
        return await withTimeout(
            pending,
            YOUTUBEI_STREAM_TIMEOUT_MS,
            'youtubei stream',
        )
    } catch (error) {
        destroyLateStream(pending)
        throw error
    }
}

/**
 * Top YouTube video hits for a query through youtubei.js, in the shape the
 * yt-dlp search returns so pickYouTubeCandidate can validate them.
 */
export async function searchYoutubeiCandidates(
    query: string,
    limit = 5,
): Promise<YtSearchCandidate[]> {
    if (!query.trim()) throw new Error('youtubei search: empty query')
    if (!isHostedYoutubeEnabled()) throw new Error(KILL_SWITCH_ERROR)
    const results = await withTimeout(
        getTube().then((tube) => tube.search(query, { type: 'video' })),
        YOUTUBEI_SEARCH_TIMEOUT_MS,
        'youtubei search',
    )
    const candidates: YtSearchCandidate[] = []
    for (const node of results.videos as unknown as SearchVideoNode[]) {
        if (typeof node.video_id !== 'string' || !node.title) continue
        candidates.push({
            id: node.video_id,
            title: node.title.toString(),
            channel: node.author?.name ?? '',
            durationSec: node.duration?.seconds ?? null,
        })
        if (candidates.length >= limit) break
    }
    return candidates
}
