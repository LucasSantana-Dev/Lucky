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

describe('clearAutoplayGuildState (#3280)', () => {
    beforeEach(() => detectSessionMoodMock.mockClear())

    it('drops the cached session mood so the next session recomputes it', async () => {
        const queue = makeQueue('mood-guild')
        const track = queue.currentTrack as Track

        await extractSeedAndSessionMood(queue, track)
        await extractSeedAndSessionMood(queue, track)
        expect(detectSessionMoodMock).toHaveBeenCalledTimes(1)

        clearAutoplayGuildState('mood-guild')
        await extractSeedAndSessionMood(queue, track)
        expect(detectSessionMoodMock).toHaveBeenCalledTimes(2)
    })

    it('leaves no per-guild entry behind once a refill settles and the guild is cleared', async () => {
        await replenishQueue(makeQueue('settle-guild'))
        await new Promise((r) => setImmediate(r))

        clearAutoplayGuildState('settle-guild')

        expect(__autoplayGuildStateForTests('settle-guild')).toEqual({
            lock: false,
            counter: false,
            mood: false,
        })
    })

    it('keeps the lock of a refill still in flight so the next one stays serialised', async () => {
        let release!: (v: boolean) => void
        jest.mocked(premiumService.isPremium).mockReturnValueOnce(
            new Promise<boolean>((r) => {
                release = r
            }),
        )
        const pending = replenishQueue(makeQueue('busy-guild'))

        clearAutoplayGuildState('busy-guild')
        expect(__autoplayGuildStateForTests('busy-guild').lock).toBe(true)

        release(false)
        await pending
    })
})
