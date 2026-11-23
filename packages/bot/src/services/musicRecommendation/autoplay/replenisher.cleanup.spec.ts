import type { GuildQueue, Track } from 'discord-player'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    premiumService: { isPremium: jest.fn().mockResolvedValue(false) },
}))

const detectSessionMoodMock = jest.fn().mockReturnValue('neutral')
jest.mock('./sessionMood', () => ({
    ...jest.requireActual('./sessionMood'),
    detectSessionMood: (...args: unknown[]) => detectSessionMoodMock(...args),
}))

import { premiumService } from '@lucky/shared/services'
import {
    __autoplayGuildStateForTests,
    clearAutoplayGuildState,
    enqueueAndFinalize,
    extractSeedAndSessionMood,
    replenishQueue,
} from './replenisher'

function makeQueue(guildId: string): GuildQueue {
    return {
        guild: { id: guildId },
        currentTrack: { title: 'Song', author: 'Band', url: 'u' },
        tracks: { size: 0, toArray: () => [] },
        history: { tracks: { toArray: () => [] } },
        metadata: {},
    } as unknown as GuildQueue
}

// An empty pass still advances the guild's refill counter.
async function seedGuildState(queue: GuildQueue): Promise<void> {
    await extractSeedAndSessionMood(queue, queue.currentTrack as Track)
    await enqueueAndFinalize(
        {
            queue,
            currentTrack: queue.currentTrack,
            excludedUrls: new Set(),
            excludedKeys: new Set(),
            autoplayMode: 'similar',
        } as unknown as Parameters<typeof enqueueAndFinalize>[0],
        [],
        new Map(),
        null,
        {},
        Date.now(),
    )
}

function stallPremiumCheck(): (v: boolean) => void {
    let release!: (v: boolean) => void
    jest.mocked(premiumService.isPremium).mockReturnValueOnce(
        new Promise<boolean>((r) => {
            release = r
        }),
    )
    return (v) => release(v)
}

describe('clearAutoplayGuildState (#3280)', () => {
    beforeEach(() => detectSessionMoodMock.mockClear())

    it('drops the counter, mood and settled lock of the ended session', async () => {
        const queue = makeQueue('ended-guild')
        await replenishQueue(queue)
        await seedGuildState(queue)
        expect(__autoplayGuildStateForTests('ended-guild')).toEqual({
            lock: true,
            counter: true,
            mood: true,
        })

        await clearAutoplayGuildState('ended-guild')

        expect(__autoplayGuildStateForTests('ended-guild')).toEqual({
            lock: false,
            counter: false,
            mood: false,
        })
        await extractSeedAndSessionMood(queue, queue.currentTrack as Track)
        expect(detectSessionMoodMock).toHaveBeenCalledTimes(2)
    })

    it('waits for a refill still in flight before clearing', async () => {
        const queue = makeQueue('busy-guild')
        await seedGuildState(queue)
        const release = stallPremiumCheck()
        const pending = replenishQueue(queue)

        const cleared = clearAutoplayGuildState('busy-guild')
        await new Promise((r) => setImmediate(r))
        expect(__autoplayGuildStateForTests('busy-guild')).toEqual({
            lock: true,
            counter: true,
            mood: true,
        })

        release(false)
        await pending
        await cleared
        expect(__autoplayGuildStateForTests('busy-guild')).toEqual({
            lock: false,
            counter: false,
            mood: false,
        })
    })

    it('leaves the state of a refill queued by a new session alone', async () => {
        const queue = makeQueue('reused-guild')
        await seedGuildState(queue)
        const release = stallPremiumCheck()
        const first = replenishQueue(queue)
        const cleared = clearAutoplayGuildState('reused-guild')
        const second = replenishQueue(queue)

        release(false)
        await first
        await cleared
        expect(__autoplayGuildStateForTests('reused-guild').counter).toBe(true)
        await second
    })
})
