import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue, Player } from 'discord-player'
import { ChannelType } from 'discord.js'
import { MusicWatchdogService } from './watchdog'

// --- mocks ---

const keysMock = jest.fn()
const isHealthyMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: (...args: unknown[]) => isHealthyMock(...args),
        keys: (...args: unknown[]) => keysMock(...args),
    },
}))

const getSnapshotMock = jest.fn()
const restoreSnapshotMock = jest.fn()
const deleteSnapshotMock = jest.fn()

jest.mock('./sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        getSnapshot: (...args: unknown[]) => getSnapshotMock(...args),
        restoreSnapshot: (...args: unknown[]) => restoreSnapshotMock(...args),
        deleteSnapshot: (...args: unknown[]) => deleteSnapshotMock(...args),
    },
}))

describe('MusicWatchdogService', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        isHealthyMock.mockReturnValue(false)
    })

    it('attempts recovery when queue is stalled', async () => {
        const connection = {
            state: { status: 'disconnected' },
            rejoin: jest.fn(() => {
                connection.state.status = 'ready'
            }),
        }
        const play = jest.fn().mockResolvedValue(undefined)
        const service = new MusicWatchdogService({ timeoutMs: 1_000 })
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
})

describe('MusicWatchdogService — orphan session monitor', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        isHealthyMock.mockReturnValue(true)
        keysMock.mockResolvedValue([])
        getSnapshotMock.mockResolvedValue(null)
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 1,
            sessionSnapshotId: 'snapshot-1',
        })
        deleteSnapshotMock.mockResolvedValue(undefined)
    })

    it('startOrphanSessionMonitor starts interval and calls scanOrphanSessions', async () => {
        const service = new MusicWatchdogService()
        const scanSpy = jest
            .spyOn(service, 'scanOrphanSessions')
            .mockResolvedValue(undefined)

        const player = {} as unknown as Player
        service.startOrphanSessionMonitor(player, 60_000)

        await jest.advanceTimersByTimeAsync(60_000)
        expect(scanSpy).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(60_000)
        expect(scanSpy).toHaveBeenCalledTimes(2)

        service.stopOrphanSessionMonitor()
    })

    it('startOrphanSessionMonitor is idempotent — second call is a no-op', () => {
        const service = new MusicWatchdogService()
        const scanSpy = jest
            .spyOn(service, 'scanOrphanSessions')
            .mockResolvedValue(undefined)

        const player = {} as unknown as Player
        service.startOrphanSessionMonitor(player, 60_000)
        service.startOrphanSessionMonitor(player, 60_000)

        jest.advanceTimersByTime(60_000)
        expect(scanSpy).toHaveBeenCalledTimes(1)

        service.stopOrphanSessionMonitor()
    })

    it('stopOrphanSessionMonitor stops the interval', async () => {
        const service = new MusicWatchdogService()
        const scanSpy = jest
            .spyOn(service, 'scanOrphanSessions')
            .mockResolvedValue(undefined)

        const player = {} as unknown as Player
        service.startOrphanSessionMonitor(player, 60_000)
        service.stopOrphanSessionMonitor()

        await jest.advanceTimersByTimeAsync(120_000)
        expect(scanSpy).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions skips when Redis is unhealthy', async () => {
        isHealthyMock.mockReturnValue(false)
        const service = new MusicWatchdogService()
        const player = {} as unknown as Player

        await service.scanOrphanSessions(player)

        expect(keysMock).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions skips when no session keys exist', async () => {
        keysMock.mockResolvedValue([])
        const service = new MusicWatchdogService()
        const player = {} as unknown as Player

        await service.scanOrphanSessions(player)

        expect(getSnapshotMock).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions skips guild when snapshot is missing', async () => {
        keysMock.mockResolvedValue(['music:session:guild-99'])
        getSnapshotMock.mockResolvedValue(null)

        const nodes = { get: jest.fn().mockReturnValue(null) }
        const player = { nodes } as unknown as Player

        const service = new MusicWatchdogService()
        await service.scanOrphanSessions(player)

        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions skips guild when snapshot is stale (>30 min)', async () => {
        keysMock.mockResolvedValue(['music:session:guild-stale'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 31 * 60 * 1_000,
            voiceChannelId: 'vc-1',
            tracks: [],
        })

        const nodes = { get: jest.fn().mockReturnValue(null) }
        const player = { nodes } as unknown as Player

        const service = new MusicWatchdogService()
        await service.scanOrphanSessions(player)

        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions skips guild when queue is already playing', async () => {
        keysMock.mockResolvedValue(['music:session:guild-playing'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60_000,
            voiceChannelId: 'vc-1',
            tracks: [{ title: 'Song', url: 'https://example.com/song' }],
        })

        const existingQueue = { node: { isPlaying: () => true } }
        const nodes = { get: jest.fn().mockReturnValue(existingQueue) }
        const player = { nodes } as unknown as Player

        const service = new MusicWatchdogService()
        await service.scanOrphanSessions(player)

        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions skips guild when voice channel has no non-bot members', async () => {
        keysMock.mockResolvedValue(['music:session:guild-empty'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60_000,
            voiceChannelId: 'vc-empty',
            tracks: [{ title: 'Song', url: 'https://example.com/song' }],
        })

        const voiceChannel = {
            type: ChannelType.GuildVoice,
            members: { filter: jest.fn().mockReturnValue({ size: 0 }) },
        }
        const guild = {
            channels: { cache: { get: jest.fn().mockReturnValue(voiceChannel) } },
        }
        const nodes = { get: jest.fn().mockReturnValue(null) }
        const client = { guilds: { cache: { get: jest.fn().mockReturnValue(guild) } } }
        const player = { nodes, client } as unknown as Player

        const service = new MusicWatchdogService()
        await service.scanOrphanSessions(player)

        expect(restoreSnapshotMock).not.toHaveBeenCalled()
    })

    it('scanOrphanSessions recovers orphan session when all conditions met', async () => {
        keysMock.mockResolvedValue(['music:session:guild-recover'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60_000,
            voiceChannelId: 'vc-active',
            tracks: [{ title: 'Song', url: 'https://example.com/song' }],
        })
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 1,
            sessionSnapshotId: 'snapshot-recover',
        })

        const voiceChannel = {
            type: ChannelType.GuildVoice,
            members: { filter: jest.fn().mockReturnValue({ size: 2 }) },
        }
        const queue = {
            setRepeatMode: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
        }
        const guild = {
            channels: { cache: { get: jest.fn().mockReturnValue(voiceChannel) } },
        }
        const nodes = {
            get: jest.fn().mockReturnValue(null),
            create: jest.fn().mockReturnValue(queue),
        }
        const client = { guilds: { cache: { get: jest.fn().mockReturnValue(guild) } } }
        const player = { nodes, client } as unknown as Player

        const service = new MusicWatchdogService()
        await service.scanOrphanSessions(player)

        expect(nodes.create).toHaveBeenCalledWith(guild)
        expect(queue.connect).toHaveBeenCalledWith(voiceChannel)
        expect(restoreSnapshotMock).toHaveBeenCalledWith(queue)
        expect(service.getGuildState('guild-recover')).toEqual(
            expect.objectContaining({ lastRecoveryAction: 'rejoin' }),
        )
    })

    it('clears snapshot and marks failed when restore yields no tracks', async () => {
        keysMock.mockResolvedValue(['music:session:guild-empty-restore'])
        getSnapshotMock.mockResolvedValue({
            savedAt: Date.now() - 60_000,
            voiceChannelId: 'vc-active',
            tracks: [{ title: 'Song', url: 'https://example.com/song' }],
        })
        restoreSnapshotMock.mockResolvedValue({
            restoredCount: 0,
            sessionSnapshotId: null,
        })

        const voiceChannel = {
            type: ChannelType.GuildVoice,
            members: { filter: jest.fn().mockReturnValue({ size: 2 }) },
        }
        const queue = {
            setRepeatMode: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
        }
        const guild = {
            channels: { cache: { get: jest.fn().mockReturnValue(voiceChannel) } },
        }
        const nodes = {
            get: jest.fn().mockReturnValue(null),
            create: jest.fn().mockReturnValue(queue),
        }
        const client = { guilds: { cache: { get: jest.fn().mockReturnValue(guild) } } }
        const player = { nodes, client } as unknown as Player

        const service = new MusicWatchdogService()
        await service.scanOrphanSessions(player)

        expect(deleteSnapshotMock).toHaveBeenCalledWith('guild-empty-restore')
        expect(service.getGuildState('guild-empty-restore')).toEqual(
            expect.objectContaining({
                lastRecoveryAction: 'failed',
                lastRecoveryDetail: 'snapshot_restore_empty',
            }),
        )
    })

    it('scanOrphanSessions isolates errors per guild', async () => {
        keysMock.mockResolvedValue([
            'music:session:guild-err',
            'music:session:guild-ok',
        ])
        getSnapshotMock
            .mockRejectedValueOnce(new Error('Redis read error'))
            .mockResolvedValueOnce(null)

        const nodes = { get: jest.fn().mockReturnValue(null) }
        const player = { nodes } as unknown as Player

        const service = new MusicWatchdogService()
        // Should not throw even though first guild errors
        await expect(service.scanOrphanSessions(player)).resolves.toBeUndefined()
    })
})
