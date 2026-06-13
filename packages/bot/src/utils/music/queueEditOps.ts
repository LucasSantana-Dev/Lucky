import { type Track, type GuildQueue } from 'discord-player'
import { randomInt } from 'node:crypto'
import { debugLog, errorLog } from '@lucky/shared/utils'
import { assertDefined } from '@lucky/shared/utils/guards'
import { replenishQueue } from './autoplay/replenisher'
import { markAsAutoplayTrack } from './autoplay/queueMarkers'


function randomIndex(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0
    return randomInt(maxExclusive)
}

function randomJitter(max: number): number {
    if (max <= 0) return 0
    return (randomInt(10_000) / 10_000) * max
}

export async function clearQueue(queue: GuildQueue): Promise<boolean> {
    try {
        queue.clear()
        debugLog({ message: 'Queue cleared successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error clearing queue:', error })
        return false
    }
}

export async function shuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        for (let i = tracks.length - 1; i > 0; i--) {
            const j = randomIndex(i + 1)
            ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
        }

        queue.clear()
        for (const track of tracks) {
            queue.addTrack(track)
        }

        debugLog({ message: 'Queue shuffled successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error shuffling queue:', error })
        return false
    }
}

export async function smartShuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        const pool = [...tracks]
        const shuffled: Track[] = []
        const initialByUser = new Map<string, number>()
        const placedByUser = new Map<string, number>()

        for (const track of pool) {
            const userId = track.requestedBy?.id ?? 'autoplay'
            initialByUser.set(userId, (initialByUser.get(userId) ?? 0) + 1)
        }

        while (pool.length > 0) {
            const scored = pool.map((track, index) => {
                const userId = track.requestedBy?.id ?? 'autoplay'
                const totalForUser = initialByUser.get(userId) ?? 1
                const placedForUser = placedByUser.get(userId) ?? 0
                const fairnessScore = placedForUser / totalForUser
                return {
                    track,
                    index,
                    score: fairnessScore + randomJitter(0.05),
                }
            })

            scored.sort((a, b) => a.score - b.score)
            const candidateWindow = scored.slice(0, Math.min(3, scored.length))
            const chosen = candidateWindow[randomIndex(candidateWindow.length)]
            if (!chosen) break

            const userId = chosen.track.requestedBy?.id ?? 'autoplay'
            placedByUser.set(userId, (placedByUser.get(userId) ?? 0) + 1)
            shuffled.push(chosen.track)
            pool.splice(chosen.index, 1)
        }

        queue.clear()
        for (const track of shuffled) {
            queue.addTrack(track)
        }

        debugLog({
            message: 'Queue smart-shuffled successfully',
            data: { guildId: queue.guild.id, queueSize: queue.tracks.size },
        })
        return true
    } catch (error) {
        errorLog({ message: 'Error smart-shuffling queue:', error })
        return false
    }
}

export async function removeTrackFromQueue(
    queue: GuildQueue,
    position: number,
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (position < 0 || position >= tracks.length) return null

        const track = tracks[position]
        queue.node.remove(track)
        debugLog({
            message: 'Track removed from queue',
            data: { position, track: track.title },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Error removing track from queue:', error })
        return null
    }
}

export async function moveTrackInQueue(
    queue: GuildQueue,
    fromPosition: number,
    toPosition: number,
): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (
            fromPosition < 0 ||
            fromPosition >= tracks.length ||
            toPosition < 0 ||
            toPosition >= tracks.length
        )
            return null

        const track = tracks[fromPosition]
        queue.node.remove(track)

        const newTracks = queue.tracks.toArray()
        if (toPosition >= newTracks.length) {
            queue.addTrack(track)
        } else {
            queue.insertTrack(track, toPosition)
        }

        debugLog({
            message: 'Track moved in queue',
            data: { track: track.title, from: fromPosition, to: toPosition },
        })
        return track
    } catch (error) {
        errorLog({ message: 'Error moving track in queue:', error })
        return null
    }
}

export function extractSpotifyTrackId(track: Track): string | null {
    const match =
        track.url?.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) ??
        track.url?.match(/^spotify:track:([A-Za-z0-9]+)/)
    return match?.[1] ?? null
}

export { markAsAutoplayTrack}

export function moveUserTrackToPriority(queue: GuildQueue, track: Track): void {
    const tracks = queue.tracks.toArray()
    let trackIndex = -1
    for (let i = tracks.length - 1; i >= 0; i--) {
        const t = assertDefined(tracks[i], 'Array index guaranteed by loop bounds')
        if (
            t === track ||
            (Boolean(track.id) && t.id === track.id) ||
            (Boolean(track.url) && t.url === track.url)
        ) {
            trackIndex = i
            break
        }
    }

    if (trackIndex === -1) {
        debugLog({
            message: 'User track not in queue (already playing)',
            data: { title: track.title },
        })
        return
    }

    const firstAutoplayIndex = tracks.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (firstAutoplayIndex === -1 || trackIndex < firstAutoplayIndex) {
        return
    }

    const queuedTrack = assertDefined(tracks[trackIndex], 'Track index guaranteed by prior check')

    try {
        queue.node.remove(queuedTrack)
    } catch {
        return
    }

    const remaining = queue.tracks.toArray()
    const newFirstAutoplayIndex = remaining.findIndex((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (newFirstAutoplayIndex === -1) {
        queue.addTrack(queuedTrack)
    } else {
        queue.insertTrack(queuedTrack, newFirstAutoplayIndex)
    }

    debugLog({
        message: 'User track moved to priority position',
        data: {
            title: queuedTrack.title,
            insertAt:
                newFirstAutoplayIndex === -1 ? 'end' : newFirstAutoplayIndex,
        },
    })
}

export async function blendAutoplayTracks(
    queue: GuildQueue,
    _newSeedTrack: Track,
    blendRatio = 0.5,
): Promise<void> {
    const tracks = queue.tracks.toArray()
    const autoplayTracks = tracks.filter((t) => {
        const meta = (t.metadata ?? {}) as { isAutoplay?: boolean }
        return meta.isAutoplay === true
    })

    if (autoplayTracks.length === 0) return

    const keepCount = Math.ceil(autoplayTracks.length * blendRatio)
    const toRemove = autoplayTracks.slice(keepCount)

    for (const track of toRemove) {
        try {
            queue.node.remove(track)
        } catch {
            // Track may already be removed
        }
    }

    debugLog({
        message: 'Autoplay tracks blended',
        data: {
            kept: keepCount,
            removed: toRemove.length,
        },
    })

    await replenishQueue(queue)
}
