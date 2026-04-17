import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue } from 'discord-player'

const debugLogMock = jest.fn()
const infoLogMock = jest.fn()
const restoreSnapshotMock = jest.fn()
const saveSnapshotMock = jest.fn()
const watchdogArmMock = jest.fn()
const watchdogCheckRecoverMock = jest.fn()
const watchdogClearMock = jest.fn()
const watchdogMarkIntentionalStopMock = jest.fn()
const watchdogIsIntentionalStopMock = jest.fn(() => false)
const replenishQueueMock = jest.fn()

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
        isIntentionalStop: watchdogIsIntentionalStopMock,
        markIntentionalStop: watchdogMarkIntentionalStopMock,
    },
}))

jest.mock('../../utils/music/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

import {
    setupLifecycleHandlers,
    setupVoiceKickDetection,
} from './lifecycleHandlers'

type PlayerEventHandler = (queue: GuildQueue, message?: string) => Promise<void>

describe('setupLifecycleHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        restoreSnapshotMock.mockResolvedValue({ restoredCount: 0 })
        saveSnapshotMock.mockResolvedValue(null)
        watchdogCheckRecoverMock.mockResolvedValue('none')
        watchdogIsIntentionalStopMock.mockReturnValue(false)
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

    it('does NOT call checkAndRecover when connectionDestroyed', async () => {
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
            guild: { id: 'guild-3', name: 'Guild 3' },
        } as unknown as GuildQueue

        await handlers.connectionDestroyed(queue)

        expect(saveSnapshotMock).toHaveBeenCalled()
        expect(watchdogCheckRecoverMock).not.toHaveBeenCalled()
    })

    it('does NOT call checkAndRecover when disconnect is intentional stop', async () => {
        watchdogIsIntentionalStopMock.mockReturnValue(true)

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
            guild: { id: 'guild-4', name: 'Guild 4' },
        } as unknown as GuildQueue

        await handlers.disconnect(queue)

        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
        expect(watchdogCheckRecoverMock).not.toHaveBeenCalled()
    })

    it('replenishes queue on emptyQueue when autoplay is enabled', async () => {
        const handlers: Record<string, PlayerEventHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerEventHandler) => {
                    handlers[event] = handler
                }),
            },
        }

        setupLifecycleHandlers(player)

        const track = { id: 'track-1', title: 'Test' }
        const queue = {
            guild: { id: 'guild-5', name: 'Guild 5' },
            repeatMode: 3,
            currentTrack: track,
        } as unknown as GuildQueue

        await handlers.emptyQueue(queue)

        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('marks intentional stop on emptyQueue when autoplay is disabled', async () => {
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
            guild: { id: 'guild-5', name: 'Guild 5' },
            repeatMode: 2,
            currentTrack: null,
        } as unknown as GuildQueue

        await handlers.emptyQueue(queue)

        expect(watchdogMarkIntentionalStopMock).toHaveBeenCalledWith('guild-5')
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })
})

describe('setupVoiceKickDetection', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('marks intentional stop when bot is kicked from voice channel', () => {
        const voiceStateUpdateListeners: Array<
            (oldState: any, newState: any) => void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => void,
                ) => {
                    if (event === 'voiceStateUpdate') {
                        voiceStateUpdateListeners.push(handler)
                    }
                },
            ),
        }

        setupVoiceKickDetection(client)

        expect(voiceStateUpdateListeners.length).toBe(1)

        const oldState = {
            member: { id: 'bot-user-id' },
            channelId: 'voice-channel-1',
            guild: { id: 'guild-1', name: 'Test Guild' },
        }
        const newState = {
            member: { id: 'bot-user-id' },
            channelId: null,
        }

        voiceStateUpdateListeners[0](oldState, newState)

        expect(watchdogMarkIntentionalStopMock).toHaveBeenCalledWith('guild-1')
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/disconnected from voice/i),
            }),
        )
    })

    it('ignores voiceStateUpdate for non-bot members', () => {
        const voiceStateUpdateListeners: Array<
            (oldState: any, newState: any) => void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => void,
                ) => {
                    if (event === 'voiceStateUpdate') {
                        voiceStateUpdateListeners.push(handler)
                    }
                },
            ),
        }

        setupVoiceKickDetection(client)

        const oldState = {
            member: { id: 'other-user-id' },
            channelId: 'voice-channel-1',
            guild: { id: 'guild-1', name: 'Test Guild' },
        }
        const newState = {
            member: { id: 'other-user-id' },
            channelId: null,
        }

        voiceStateUpdateListeners[0](oldState, newState)

        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('ignores bot moving between channels (not a disconnect)', () => {
        const voiceStateUpdateListeners: Array<
            (oldState: any, newState: any) => void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => void,
                ) => {
                    if (event === 'voiceStateUpdate') {
                        voiceStateUpdateListeners.push(handler)
                    }
                },
            ),
        }

        setupVoiceKickDetection(client)

        const oldState = {
            member: { id: 'bot-user-id' },
            channelId: 'voice-channel-1',
            guild: { id: 'guild-1', name: 'Test Guild' },
        }
        const newState = {
            member: { id: 'bot-user-id' },
            channelId: 'voice-channel-2',
        }

        voiceStateUpdateListeners[0](oldState, newState)

        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })
})
