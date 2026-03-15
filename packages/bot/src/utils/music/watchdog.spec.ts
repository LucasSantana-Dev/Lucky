import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { MusicWatchdogService } from './watchdog'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        keys: jest.fn(),
    },
}))

describe('MusicWatchdogService', () => {
    beforeEach(() => {
        jest.useFakeTimers()
    })

    it('attempts recovery when queue is stalled', async () => {
        const connection = {
            state: { status: 'disconnected' },
            rejoin: jest.fn(() => {
                connection.state.status = 'ready'
            }),
        }
        const play = jest.fn().mockResolvedValue(undefined)
        const service = new MusicWatchdogService({
            timeoutMs: 1_000,
            recoveryWaitTimeoutMs: 500,
            recoveryPollIntervalMs: 50,
        })
        const queue = {
            guild: { id: 'guild-1' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection,
            node: {
                isPlaying: () => false,
                play,
            },
            tracks: { size: 0 },
        } as unknown as GuildQueue

        service.arm(queue)
        await jest.advanceTimersByTimeAsync(1_100)

        expect(connection.rejoin).toHaveBeenCalledTimes(1)
        expect(play).toHaveBeenCalledTimes(1)
        expect(service.getGuildState('guild-1')).toEqual(
            expect.objectContaining({
                lastRecoveryAction: 'requeue_current',
                lastRecoveryDetail: 'rejoined_and_requeued_current',
            }),
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
        await jest.advanceTimersByTimeAsync(1_100)

        expect(rejoin).not.toHaveBeenCalled()
        expect(play).not.toHaveBeenCalled()
    })

    it('waits for the connection to become ready before replaying', async () => {
        const connection = {
            state: { status: 'disconnected' },
            rejoin: jest.fn(() => {
                setTimeout(() => {
                    connection.state.status = 'ready'
                }, 200)
            }),
        }
        const play = jest.fn().mockResolvedValue(undefined)
        const service = new MusicWatchdogService({
            timeoutMs: 1_000,
            recoveryWaitTimeoutMs: 500,
            recoveryPollIntervalMs: 50,
        })
        const queue = {
            guild: { id: 'guild-ready' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection,
            node: {
                isPlaying: () => false,
                play,
            },
            tracks: { size: 0 },
        } as unknown as GuildQueue

        const recoveryPromise = service.checkAndRecover(queue)
        jest.advanceTimersByTime(200)
        await recoveryPromise

        expect(connection.rejoin).toHaveBeenCalledTimes(1)
        expect(play).toHaveBeenCalledTimes(1)
        expect(service.getGuildState('guild-ready')).toEqual(
            expect.objectContaining({
                lastRecoveryAction: 'requeue_current',
                lastRecoveryDetail: 'rejoined_and_requeued_current',
            }),
        )
    })

    it('fails deterministically when the connection stays disconnected', async () => {
        const connection = {
            state: { status: 'disconnected' },
            rejoin: jest.fn(),
        }
        const play = jest.fn().mockResolvedValue(undefined)
        const service = new MusicWatchdogService({
            timeoutMs: 1_000,
            recoveryWaitTimeoutMs: 300,
            recoveryPollIntervalMs: 100,
        })
        const queue = {
            guild: { id: 'guild-failed' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection,
            node: {
                isPlaying: () => false,
                play,
            },
            tracks: { size: 0 },
        } as unknown as GuildQueue

        const recoveryPromise = service.checkAndRecover(queue)
        jest.advanceTimersByTime(400)
        const action = await recoveryPromise

        expect(action).toBe('failed')
        expect(connection.rejoin).toHaveBeenCalledTimes(1)
        expect(play).not.toHaveBeenCalled()
        expect(service.getGuildState('guild-failed')).toEqual(
            expect.objectContaining({
                lastRecoveryAction: 'failed',
                lastRecoveryDetail: 'connection_not_ready_after_rejoin',
            }),
        )
    })
})
