import type { GuildQueue } from 'discord-player'
import { warnLog } from '@lucky/shared/utils'

type NodePlay = GuildQueue['node']['play']

type Hold = { count: number; original: NodePlay; dropped: boolean }

const holds = new WeakMap<GuildQueue, Hold>()

/**
 * discord-player's play() appends the request and then calls node.play()
 * whenever isPlaying() is false. Between two tracks the next one is already
 * current while its stream resolves (seconds through the yt-dlp bridge), so
 * that bare call dispatched the track queued behind it, usually an autoplay
 * pick, ahead of the request. While held, a bare play() is a no-op when a
 * track is current; an explicit track and an idle queue pass through.
 *
 * Returns the release; holds may overlap and end in any order. If a bare
 * play() was dropped and, at release, nothing is current or playing while
 * tracks wait (the loading track failed meanwhile), it runs then, so the
 * queue never stalls on a dropped advance.
 */
export function holdLoadingTrack(
    queue: GuildQueue | null | undefined,
): () => void {
    if (!queue?.node) return () => undefined

    const existing = holds.get(queue)
    if (existing) {
        existing.count++
    } else {
        const hold: Hold = {
            count: 1,
            original: queue.node.play,
            dropped: false,
        }
        holds.set(queue, hold)
        queue.node.play = (async (res, options) => {
            if (
                res == null &&
                queue.currentTrack != null &&
                !queue.isPlaying()
            ) {
                hold.dropped = true
                return
            }
            return hold.original.call(queue.node, res, options)
        }) as NodePlay
    }

    let released = false
    return () => {
        if (released) return
        released = true
        const hold = holds.get(queue)
        if (!hold) return
        hold.count--
        if (hold.count > 0) return
        holds.delete(queue)
        queue.node.play = hold.original
        if (
            hold.dropped &&
            queue.currentTrack == null &&
            !queue.isPlaying() &&
            queue.tracks.size > 0
        ) {
            Promise.resolve()
                .then(() => hold.original.call(queue.node))
                .catch((error: unknown) => {
                    warnLog({
                        message: 'Failed to run a play held during /play',
                        data: {
                            guildId: queue.guild?.id,
                            error: String(error),
                        },
                    })
                })
        }
    }
}
