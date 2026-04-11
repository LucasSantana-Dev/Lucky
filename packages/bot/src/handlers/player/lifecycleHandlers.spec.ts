import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'
import { setupLifecycleHandlers } from './lifecycleHandlers'

const debugLogMock = jest.fn()
const infoLogMock = jest.fn()
const restoreSnapshotMock = jest.fn()
const saveSnapshotMock = jest.fn()
const watchdogArmMock = jest.fn()
const watchdogCheckRecoverMock = jest.fn()
const watchdogClearMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        restoreSnapshot: (...args: unknown[]) => restoreSnapshotMock(...args),
        saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
    },
}))

jest.mock('../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        arm: (...args: unknown[]) => watchdogArmMock(...args),
        checkAndRecover: (...args: unknown[]) =>
            watchdogCheckRecoverMock(...args),
        clear: (...args: unknown[]) => watchdogClearMock(...args),
        isIntentionalStop: () => false,
        markIntentionalStop: jest.fn(),
    },
}))

type PlayerEventHandler = (queue: GuildQueue, message?: string) => Promise<void>

describe('setupLifecycleHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        restoreSnapshotMock.mockResolvedValue({ restoredCount: 0 })
        saveSnapshotMock.mockResolvedValue(null)
        watchdogCheckRecoverMock.mockResolvedValue('none')
    })

    it('restores snapshot and arms watchdog on connection', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-1', name: 'Guild 1' },
            metadata: { requestedBy: { id: 'user-1' } },
            connection: {
                state: { status: 'ready' },
                joinConfig: {},
            },
        } as unknown as GuildQueue

        await handlers.connection(queue)

        expect(restoreSnapshotMock).toHaveBeenCalledWith(
            queue,
            expect.objectContaining({ id: 'user-1' }),
        )
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
    })

    it('saves snapshot and triggers recovery on disconnect', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const queue = {
            guild: { id: 'guild-2', name: 'Guild 2' },
        } as unknown as GuildQueue

        await handlers.disconnect(queue)

        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
        expect(watchdogCheckRecoverMock).toHaveBeenCalledWith(queue)
    })
})
