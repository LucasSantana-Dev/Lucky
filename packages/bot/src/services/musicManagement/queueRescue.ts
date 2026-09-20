import { QueryType, type Track, type GuildQueue } from 'discord-player'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { replenishQueue } from '../../services/musicRecommendation/autoplay/replenisher'

const HISTORY_SEED_LIMIT = 3
const QUEUE_RESCUE_PROBE_TIMEOUT_MS = Number.parseInt(
    process.env.QUEUE_RESCUE_PROBE_TIMEOUT_MS ?? '5000',
    10,
)
const QUEUE_RESCUE_REFILL_THRESHOLD = Number.parseInt(
    process.env.QUEUE_RESCUE_REFILL_THRESHOLD ?? '3',
    10,
)

export type QueueRescueResult = {
    removedTracks: number
    keptTracks: number
    addedTracks: number
}

export type RescueQueueOptions = {
    probeResolvable?: boolean
    probeTimeoutMs?: number
    refillThreshold?: number
}

function isPlayableTrack(track: Track): boolean {
    return Boolean(track.url) && Boolean(track.title) && Boolean(track.author)
}

async function probeTrackResolvable(
    queue: GuildQueue,
    track: Track,
    timeoutMs: number,
): Promise<boolean> {
    const query = track.url || `${track.title} ${track.author}`.trim()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
        const result = await Promise.race([
            queue.player.search(query, { searchEngine: QueryType.AUTO }),
            new Promise<null>(
                (resolve) =>
                    (timeoutId = setTimeout(() => resolve(null), timeoutMs)),
            ),
        ])
        return result !== null && result.tracks.length > 0
    } catch (error) {
        // The timeout race resolves to `null` above rather than throwing, so
        // reaching here means the probe itself errored (network blip,
        // extractor crash) — not a confirmed "track is gone." Debug, not
        // warn/error: one probe failing is expected occasionally and the
        // rescue flow already errorLogs if it fails overall (#2134).
        debugLog({
            message: 'Track resolvability probe failed',
            data: { query, error: String(error) },
        })
        return false
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    }
}

export async function rescueQueue(
    queue: GuildQueue,
    opts: RescueQueueOptions = {},
): Promise<QueueRescueResult> {
    const {
        probeResolvable = false,
        probeTimeoutMs = QUEUE_RESCUE_PROBE_TIMEOUT_MS,
        refillThreshold = QUEUE_RESCUE_REFILL_THRESHOLD,
    } = opts

    try {
        const tracks = queue.tracks.toArray()
        const keptTracks: Track[] = []
        let removedTracks = 0

        for (const track of tracks) {
            if (!isPlayableTrack(track)) {
                removedTracks++
                continue
            }
            if (probeResolvable) {
                const resolvable = await probeTrackResolvable(
                    queue,
                    track,
                    probeTimeoutMs,
                )
                if (!resolvable) {
                    removedTracks++
                    continue
                }
            }
            keptTracks.push(track)
        }

        queue.clear()
        for (const track of keptTracks) {
            queue.addTrack(track)
        }

        const beforeReplenish = queue.tracks.size
        if (queue.currentTrack && queue.tracks.size < refillThreshold) {
            await replenishQueue(queue)
        }
        const addedTracks = Math.max(0, queue.tracks.size - beforeReplenish)

        return {
            removedTracks,
            keptTracks: keptTracks.length,
            addedTracks,
        }
    } catch (error) {
        errorLog({ message: 'Error rescuing queue:', error })
        return {
            removedTracks: 0,
            keptTracks: queue.tracks.size,
            addedTracks: 0,
        }
    }
}

function getAllHistoryTracks(queue: GuildQueue): Track[] {
    const history = queue.history as
        { tracks?: { toArray?: () => Track[]; data?: Track[] } } | undefined

    if (!history?.tracks) return []
    if (typeof history.tracks.toArray === 'function')
        return history.tracks.toArray()
    if (Array.isArray(history.tracks.data)) return history.tracks.data
    return []
}

export function getHistoryTracks(queue: GuildQueue): Track[] {
    return getAllHistoryTracks(queue).slice(0, HISTORY_SEED_LIMIT)
}

export { buildVcContributionWeights } from '../../services/musicRecommendation/autoplay/vcWeights'
