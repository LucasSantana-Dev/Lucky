import { describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { holdLoadingTrack } from './holdLoadingTrack'

jest.mock('@lucky/shared/utils', () => ({ warnLog: jest.fn() }))

type FakeQueue = {
    currentTrack: { title: string } | null
    playing: boolean
    isPlaying: () => boolean
    tracks: { size: number }
    node: {
        play: jest.Mock<(res?: unknown, opts?: unknown) => Promise<void>>
    }
}

function createQueue(
    current: string | null,
    playing: boolean,
    queued = 0,
): FakeQueue {
    const queue: FakeQueue = {
        currentTrack: current ? { title: current } : null,
        playing,
        isPlaying: () => queue.playing,
        tracks: { size: queued },
        node: { play: jest.fn(async () => undefined) },
    }
    return queue
}

const asQueue = (q: FakeQueue) => q as unknown as GuildQueue
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('holdLoadingTrack', () => {
    // Prod, guild "Job", 2026-11-16 18:04: "eu liguei pra minha mãe" ended,
    // the autoplay pick "Chamyto Freestyle 2" was current while its stream
    // resolved (25 s of yt-dlp 403/timeouts). /play "im tired zendaya" ran
    // discord-player's play(), whose bare node.play() dispatched the next
    // autoplay pick "My Little Poney" ahead of the request.
    it('keeps a bare play() from dispatching while the current track loads', async () => {
        const queue = createQueue('Chamyto Freestyle 2', false, 2)
        const original = queue.node.play

        const release = holdLoadingTrack(asQueue(queue))
        await queue.node.play()
        release()
        await flush()

        expect(original).not.toHaveBeenCalled()
        expect(queue.node.play).toBe(original)
    })

    it('lets a bare play() through while the current track plays', async () => {
        const queue = createQueue('Playing Song', true)
        const original = queue.node.play

        const release = holdLoadingTrack(asQueue(queue))
        await queue.node.play()
        release()

        expect(original).toHaveBeenCalledTimes(1)
    })

    it('lets a bare play() start an idle queue with nothing current', async () => {
        const queue = createQueue(null, false)
        const original = queue.node.play

        const release = holdLoadingTrack(asQueue(queue))
        await queue.node.play()
        release()

        expect(original).toHaveBeenCalledTimes(1)
    })

    it('passes an explicit track through', async () => {
        const queue = createQueue('Loading Song', false)
        const original = queue.node.play
        const track = { title: 'Other' }

        const release = holdLoadingTrack(asQueue(queue))
        await queue.node.play(track, { queue: false })
        release()

        expect(original).toHaveBeenCalledWith(track, { queue: false })
    })

    it('runs a dropped play() at release when the loading track failed meanwhile', async () => {
        const queue = createQueue('Loading Song', false, 2)
        const original = queue.node.play

        const release = holdLoadingTrack(asQueue(queue))
        await queue.node.play()
        queue.currentTrack = null
        release()
        await flush()

        expect(original).toHaveBeenCalledTimes(1)
    })

    it('restores play() once overlapping holds end in any order', async () => {
        const queue = createQueue('Loading Song', false)
        const original = queue.node.play

        const first = holdLoadingTrack(asQueue(queue))
        const second = holdLoadingTrack(asQueue(queue))
        first()
        await queue.node.play()
        expect(original).not.toHaveBeenCalled()
        second()
        second()

        expect(queue.node.play).toBe(original)
    })

    it('does nothing without a queue', () => {
        expect(() => holdLoadingTrack(undefined)()).not.toThrow()
    })
})
