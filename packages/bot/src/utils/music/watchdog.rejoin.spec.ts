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
        isHealthy: jest.fn(() => false),
        keys: jest.fn(async () => []),
    },
}))

jest.mock('./sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        getSnapshot: jest.fn(async () => null),
        restoreSnapshot: jest.fn(async () => ({
            restoredCount: 0,
            sessionSnapshotId: 'none',
        })),
        deleteSnapshot: jest.fn(async () => undefined),
    },
}))

describe('MusicWatchdogService retry reconnect', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('recovers when second rejoin reaches ready state', async () => {
        const connection = {
            state: { status: 'disconnected' },
            rejoin: jest.fn(() => {
                if (connection.rejoin.mock.calls.length >= 2) {
                    connection.state.status = 'ready'
                }
            }),
        }
        const play = jest.fn(async () => undefined)
        const service = new MusicWatchdogService({
            recoveryWaitTimeoutMs: 0,
            recoveryPollIntervalMs: 1,
        })
        const queue = {
            guild: { id: 'guild-rejoin-success' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection,
            node: {
                isPlaying: () => false,
                play,
            },
            tracks: { size: 0 },
        } as unknown as GuildQueue

        const action = await service.checkAndRecover(queue)

        expect(action).toBe('requeue_current')
        expect(connection.rejoin).toHaveBeenCalledTimes(2)
        expect(play).toHaveBeenCalledTimes(1)
    })

    it('fails with retry detail when connection stays not-ready', async () => {
        const connection = {
            state: { status: 'disconnected' },
            rejoin: jest.fn(),
        }
        const play = jest.fn(async () => undefined)
        const service = new MusicWatchdogService({
            recoveryWaitTimeoutMs: 0,
            recoveryPollIntervalMs: 1,
        })
        const queue = {
            guild: { id: 'guild-rejoin-failed' },
            currentTrack: { title: 'Song', url: 'https://example.com/song' },
            connection,
            node: {
                isPlaying: () => false,
                play,
            },
            tracks: { size: 0 },
        } as unknown as GuildQueue

        const action = await service.checkAndRecover(queue)

        expect(action).toBe('failed')
        expect(connection.rejoin).toHaveBeenCalledTimes(2)
        expect(play).not.toHaveBeenCalled()
        expect(service.getGuildState('guild-rejoin-failed')).toEqual(
            expect.objectContaining({
                lastRecoveryDetail: 'connection_not_ready_after_rejoin_retry',
            }),
        )
    })
})
