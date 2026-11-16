import type { GuildQueue } from 'discord-player'

type NodePlay = GuildQueue['node']['play']

const holds = new WeakMap<GuildQueue, { count: number; original: NodePlay }>()

/**
 * discord-player's play() appends the request and then calls node.play()
 * whenever isPlaying() is false. Between two tracks the next one is already
 * current while its stream resolves (seconds through the yt-dlp bridge), so
 * that bare call dispatched the track queued behind it, usually an autoplay
 * pick, ahead of the request. While held, a bare play() is a no-op when a
 * track is current; an explicit track and an idle queue pass through.
 *
 * Returns the release; holds may overlap and end in any order.
 */
export function holdLoadingTrack(
    queue: GuildQueue | null | undefined,
): () => void {
    if (!queue?.node) return () => undefined

    const existing = holds.get(queue)
    if (existing) {
        existing.count++
    } else {
        const original = queue.node.play
        holds.set(queue, { count: 1, original })
        queue.node.play = (async (res, options) => {
            if (
                res == null &&
                queue.currentTrack != null &&
                !queue.isPlaying()
            ) {
                return
            }
            return original.call(queue.node, res, options)
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
    }
}
