import type { GuildQueue } from 'discord-player'

jest.mock('lru-cache', () => ({
    LRUCache: jest.fn(function () {
        this.get = jest.fn().mockReturnValue(null)
        this.set = jest.fn()
        this.delete = jest.fn()
        this.clear = jest.fn()
    }),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    premiumService: { isPremium: jest.fn() },
}))

import { premiumService } from '@lucky/shared/services'
import {
    REPLENISH_DEADLINE_MS,
    replenishQueue,
    waitForReplenish,
} from './replenisher'

function deferred() {
    let resolve!: (v: boolean) => void
    const promise = new Promise<boolean>((r) => {
        resolve = r
    })
    return { promise, resolve }
}

const flush = () => new Promise((r) => setImmediate(r))

describe('waitForReplenish', () => {
    it('also waits for a refill queued while it was waiting', async () => {
        const first = deferred()
        const second = deferred()
        jest.mocked(premiumService.isPremium)
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise)
        const queue = {
            guild: { id: 'lock-guild' },
            currentTrack: { title: 'Song', author: 'Band', url: 'u' },
            tracks: { size: 0, toArray: () => [] },
        } as unknown as GuildQueue

        const p1 = replenishQueue(queue)
        let settled = false
        void waitForReplenish('lock-guild').then(() => {
            settled = true
        })
        const p2 = replenishQueue(queue)

        first.resolve(false)
        await p1
        await flush()
        expect(settled).toBe(false)

        second.resolve(false)
        await p2
        await flush()
        expect(settled).toBe(true)
    })

    it('reports a failed refill so the caller can leave the retry running', async () => {
        jest.mocked(premiumService.isPremium).mockRejectedValueOnce(
            new Error('db down'),
        )
        const queue = {
            guild: { id: 'fail-guild' },
            currentTrack: { title: 'Song', author: 'Band', url: 'u' },
            tracks: { size: 0, toArray: () => [] },
        } as unknown as GuildQueue

        await expect(replenishQueue(queue)).resolves.toBe(false)
        await expect(waitForReplenish('fail-guild')).resolves.toBe(false)
    })

    it('reports success when no refill is in flight', async () => {
        await expect(waitForReplenish('idle-guild')).resolves.toBe(true)
    })
    it('releases the chain when a refill hangs past the deadline (#2981)', async () => {
        jest.useFakeTimers()
        try {
            jest.mocked(premiumService.isPremium)
                .mockReturnValueOnce(new Promise<boolean>(() => {}))
                .mockResolvedValueOnce(false)
            const queue = {
                guild: { id: 'hang-guild' },
                currentTrack: { title: 'Song', author: 'Band', url: 'u' },
                tracks: { size: 0, toArray: () => [] },
            } as unknown as GuildQueue

            const hung = replenishQueue(queue)
            let settled = false
            void hung.then(() => {
                settled = true
            })
            const wait = waitForReplenish('hang-guild')
            await jest.advanceTimersByTimeAsync(REPLENISH_DEADLINE_MS - 1)
            expect(settled).toBe(false)
            await jest.advanceTimersByTimeAsync(2)

            await expect(hung).resolves.toBe(false)
            await expect(wait).resolves.toBe(false)
        } finally {
            jest.useRealTimers()
        }
    })
})
