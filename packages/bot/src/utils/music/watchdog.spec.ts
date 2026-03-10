import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { MusicWatchdogService } from './watchdog'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

describe('MusicWatchdogService', () => {
    beforeEach(() => {
        jest.useFakeTimers()
    })

    it('attempts recovery when queue is stalled', async () => {
        const rejoin = jest.fn()
        const play = jest.fn().mockResolvedValue(undefined)
        const service = new MusicWatchdogService({ timeoutMs: 1_000 })
        const queue = {
            guild: { id: 'guild-1' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection: { state: { status: 'disconnected' }, rejoin },
            node: {
                isPlaying: () => false,
                play,
            },
            tracks: { size: 0 },
        } as unknown as GuildQueue

        service.arm(queue)
        jest.advanceTimersByTime(1_100)
        await Promise.resolve()

        expect(rejoin).toHaveBeenCalledTimes(1)
        expect(play).toHaveBeenCalledTimes(1)
        expect(service.getGuildState('guild-1').lastRecoveryAction).toBe(
            'requeue_current',
        )
    })

    it('does not recover when queue is healthy and playing', async () => {
        const rejoin = jest.fn()
        const play = jest.fn().mockResolvedValue(undefined)
        const service = new MusicWatchdogService({ timeoutMs: 1_000 })
        const queue = {
            guild: { id: 'guild-2' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection: { state: { status: 'ready' }, rejoin },
            node: {
                isPlaying: () => true,
                play,
            },
            tracks: { size: 3 },
        } as unknown as GuildQueue

        service.arm(queue)
        jest.advanceTimersByTime(1_100)
        await Promise.resolve()

        expect(rejoin).not.toHaveBeenCalled()
        expect(play).not.toHaveBeenCalled()
    })
})
