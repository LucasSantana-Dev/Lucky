import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { QueueRepeatMode } from 'discord-player'
import type { GuildQueue, Track } from 'discord-player'

const clearAutoplayPause = jest.fn<(guildId: string) => void>()
const applyStoredAutoplayPreference =
    jest.fn<(queue: unknown, guildId: string) => Promise<void>>()
const blendAutoplayTracks =
    jest.fn<(queue: unknown, track: unknown) => Promise<void>>()
const clearSessionMoodCache = jest.fn<(guildId: string) => void>()
const addBreadcrumb = jest.fn()
const errorLog = jest.fn()

jest.mock('../../../../../utils/music/autoplay/skipCircuitBreaker', () => ({
    clearAutoplayPause: (id: string) => clearAutoplayPause(id),
}))
jest.mock('./autoplayPreference', () => ({
    applyStoredAutoplayPreference: (q: unknown, id: string) =>
        applyStoredAutoplayPreference(q, id),
}))
jest.mock('../../../../../utils/music/queueManipulation', () => ({
    blendAutoplayTracks: (q: unknown, t: unknown) => blendAutoplayTracks(q, t),
}))
jest.mock('../../../../../utils/music/autoplay/replenisher', () => ({
    clearSessionMoodCache: (id: string) => clearSessionMoodCache(id),
}))
jest.mock('@lucky/shared/utils/monitoring', () => ({
    addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLog(...args),
}))

import { runPostPlayBackgroundOps } from './postPlayBackgroundOps'

const guildId = 'guild-1'
const track = { title: 't' } as unknown as Track
const autoplayQueue = {
    repeatMode: QueueRepeatMode.AUTOPLAY,
} as unknown as GuildQueue

function failedOps(): string[] {
    return addBreadcrumb.mock.calls
        .filter((c) => c[0] === 'post_play_bg_op_failed')
        .map((c) => (c[3] as { op: string }).op)
}

describe('runPostPlayBackgroundOps', () => {
    beforeEach(() => {
        // Explicitly clear and reset all mock implementations to prevent test pollution
        clearAutoplayPause.mockClear()
        clearAutoplayPause.mockReturnValue(undefined)
        applyStoredAutoplayPreference.mockClear()
        applyStoredAutoplayPreference.mockResolvedValue(undefined)
        blendAutoplayTracks.mockClear()
        blendAutoplayTracks.mockResolvedValue(undefined)
        clearSessionMoodCache.mockClear()
        clearSessionMoodCache.mockReturnValue(undefined)
        addBreadcrumb.mockClear()
        errorLog.mockClear()
    })

    it('runs all three ops on the happy path with no failure breadcrumb', async () => {
        await runPostPlayBackgroundOps({
            queue: autoplayQueue,
            guildId,
            track,
            hadQueueBeforePlay: false,
            isPlaylist: false,
        })

        expect(clearAutoplayPause).toHaveBeenCalledWith(guildId)
        expect(clearSessionMoodCache).toHaveBeenCalledWith(guildId)
        expect(applyStoredAutoplayPreference).toHaveBeenCalledTimes(1)
        expect(blendAutoplayTracks).toHaveBeenCalledTimes(1)
        expect(failedOps()).toEqual([])
    })

    it('isolates a clearAutoplayPause failure — the other ops still run', async () => {
        clearAutoplayPause.mockImplementation(() => {
            throw new Error('boom')
        })

        await runPostPlayBackgroundOps({
            queue: autoplayQueue,
            guildId,
            track,
            hadQueueBeforePlay: false,
            isPlaylist: false,
        })

        // cascade is broken: preference + blend still execute
        expect(applyStoredAutoplayPreference).toHaveBeenCalledTimes(1)
        expect(blendAutoplayTracks).toHaveBeenCalledTimes(1)
        expect(failedOps()).toEqual(['clearAutoplayPause'])
    })

    it('retries a transient applyStoredAutoplayPreference failure then succeeds', async () => {
        applyStoredAutoplayPreference
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce(undefined)

        await runPostPlayBackgroundOps({
            queue: autoplayQueue,
            guildId,
            track,
            hadQueueBeforePlay: false,
            isPlaylist: false,
        })

        expect(applyStoredAutoplayPreference).toHaveBeenCalledTimes(2)
        expect(blendAutoplayTracks).toHaveBeenCalledTimes(1)
        expect(failedOps()).toEqual([])
    })

    it('records a breadcrumb when the preference op fails both attempts, and still blends', async () => {
        applyStoredAutoplayPreference.mockRejectedValue(new Error('down'))

        await runPostPlayBackgroundOps({
            queue: autoplayQueue,
            guildId,
            track,
            hadQueueBeforePlay: false,
            isPlaylist: false,
        })

        expect(applyStoredAutoplayPreference).toHaveBeenCalledTimes(2)
        expect(failedOps()).toEqual(['applyStoredAutoplayPreference'])
        expect(blendAutoplayTracks).toHaveBeenCalledTimes(1)
    })

    it('skips preference when a queue already existed, and skips blend off-autoplay', async () => {
        await runPostPlayBackgroundOps({
            queue: { repeatMode: QueueRepeatMode.OFF } as unknown as GuildQueue,
            guildId,
            track,
            hadQueueBeforePlay: true,
            isPlaylist: false,
        })

        expect(clearAutoplayPause).toHaveBeenCalledTimes(1)
        expect(applyStoredAutoplayPreference).not.toHaveBeenCalled()
        expect(blendAutoplayTracks).not.toHaveBeenCalled()
    })

    it('skips blend for a playlist', async () => {
        await runPostPlayBackgroundOps({
            queue: autoplayQueue,
            guildId,
            track,
            hadQueueBeforePlay: false,
            isPlaylist: true,
        })

        expect(blendAutoplayTracks).not.toHaveBeenCalled()
    })
})
