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

jest.mock('../../services/musicRecommendation/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        restoreSnapshot: (...args: unknown[]) => restoreSnapshotMock(...args),
        saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
    },
}))

jest.mock('../../services/musicManagement/watchdog', () => ({
    musicWatchdogService: {
        arm: (...args: unknown[]) => watchdogArmMock(...args),
        checkAndRecover: (...args: unknown[]) =>
            watchdogCheckRecoverMock(...args),
        clear: (...args: unknown[]) => watchdogClearMock(...args),
        isIntentionalStop: watchdogIsIntentionalStopMock,
        markIntentionalStop: watchdogMarkIntentionalStopMock,
    },
}))

jest.mock('../../services/musicManagement/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

const ensureStageSpeakerMock = jest.fn<() => Promise<string>>()

jest.mock('../../services/musicManagement/stageSpeaker', () => ({
    ensureStageSpeaker: (...args: unknown[]) => ensureStageSpeakerMock(),
}))

jest.mock('../../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, body: string) => ({
        kind: 'error',
        title,
        body,
    }),
    createWarningEmbed: (title: string, body: string) => ({
        kind: 'warning',
        title,
        body,
    }),
}))

import { setReplenishSuppressed } from '../../services/musicManagement/replenishSuppressionStore'
import {
    setupLifecycleHandlers,
    setupStageSpeaker,
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
            expect.objectContaining({ signal: expect.anything() }),
        )
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
    })

    it('aborts the restore and continues with an empty queue when it exceeds the deadline', async () => {
        jest.useFakeTimers()
        let capturedSignal: AbortSignal | undefined
        // Restore never resolves, so the 2s deadline wins the race.
        restoreSnapshotMock.mockImplementation(
            (_q: unknown, _rb: unknown, opts: unknown) => {
                capturedSignal = (opts as { signal?: AbortSignal })?.signal
                return new Promise<never>(() => {})
            },
        )

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
            connection: { state: { status: 'ready' }, joinConfig: {} },
        } as unknown as GuildQueue

        const pending = handlers.connection(queue)
        await jest.advanceTimersByTimeAsync(2000)
        await pending

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Snapshot restore failed, continuing with empty queue',
            }),
        )
        // The hung restore was cancelled so it can't enqueue tracks afterward.
        expect(capturedSignal?.aborted).toBe(true)
        // Service stays armed despite the failed restore.
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
        jest.useRealTimers()
    })

    it('does NOT restore snapshot on connection when intentional stop is set (#1948)', async () => {
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
            guild: { id: 'guild-kicked', name: 'Guild Kicked' },
            metadata: { requestedBy: { id: 'user-1' } },
            connection: { state: { status: 'ready' }, joinConfig: {} },
        } as unknown as GuildQueue

        await handlers.connection(queue)

        expect(restoreSnapshotMock).not.toHaveBeenCalled()
        // Watchdog still arms — this guard only skips the stale-session restore.
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

    it('does NOT replenish on emptyQueue when replenish is suppressed (#1957)', async () => {
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
            guild: { id: 'guild-cleared', name: 'Guild Cleared' },
            repeatMode: 3,
            currentTrack: track,
        } as unknown as GuildQueue

        setReplenishSuppressed('guild-cleared', 30_000)
        try {
            await handlers.emptyQueue(queue)
        } finally {
            setReplenishSuppressed('guild-cleared', 0)
        }

        expect(replenishQueueMock).not.toHaveBeenCalled()
        // Suppressed (not "nothing to play") — must not force a full stop.
        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
    })

    it('does NOT replenish on emptyQueue when intentional stop is set (#1957)', async () => {
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

        const track = { id: 'track-1', title: 'Test' }
        const queue = {
            guild: { id: 'guild-stopped-2', name: 'Guild Stopped' },
            repeatMode: 3,
            currentTrack: track,
        } as unknown as GuildQueue

        await handlers.emptyQueue(queue)

        expect(replenishQueueMock).not.toHaveBeenCalled()
        expect(watchdogMarkIntentionalStopMock).not.toHaveBeenCalled()
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

const STAGE_CHANNEL_TYPE = 13
const VOICE_CHANNEL_TYPE = 2

describe('setupStageSpeaker', () => {
    const buildClient = (queue?: unknown) => {
        const listeners: Array<
            (oldState: any, newState: any) => Promise<void> | void
        > = []
        const client = {
            user: { id: 'bot-user-id' },
            player: { nodes: { get: jest.fn(() => queue ?? null) } },
            on: jest.fn(
                (
                    event: string,
                    handler: (oldState: any, newState: any) => Promise<void>,
                ) => {
                    if (event === 'voiceStateUpdate') listeners.push(handler)
                },
            ),
        }
        return { client, listeners }
    }

    const buildQueue = ({
        paused = false,
        playing = false,
        send = jest.fn<() => Promise<void>>(),
    } = {}) => ({
        guild: { id: 'guild-1' },
        metadata: { channel: { send } },
        node: {
            isPaused: () => paused,
            isPlaying: () => playing,
            pause: jest.fn(),
            resume: jest.fn(),
        },
        send,
    })

    const stageState = (over: Record<string, unknown> = {}) => ({
        member: { id: 'bot-user-id' },
        channel: { type: STAGE_CHANNEL_TYPE, id: 'stage-1' },
        channelId: 'stage-1',
        suppress: true,
        guild: { id: 'guild-1', name: 'Test Guild' },
        ...over,
    })

    beforeEach(() => {
        jest.clearAllMocks()
        ensureStageSpeakerMock.mockResolvedValue('requested')
    })

    it('ignores voiceStateUpdate for other members', async () => {
        const { client, listeners } = buildClient()
        setupStageSpeaker(client as any)

        await listeners[0](
            { channelId: null, suppress: true },
            stageState({ member: { id: 'someone-else' } }),
        )

        expect(ensureStageSpeakerMock).not.toHaveBeenCalled()
    })

    it('ignores normal voice channels', async () => {
        const { client, listeners } = buildClient()
        setupStageSpeaker(client as any)

        await listeners[0](
            { channelId: null, suppress: true },
            stageState({
                channel: { type: VOICE_CHANNEL_TYPE, id: 'voice-1' },
            }),
        )

        expect(ensureStageSpeakerMock).not.toHaveBeenCalled()
    })

    it('ignores the echo of its own request so it cannot loop', async () => {
        const { client, listeners } = buildClient()
        setupStageSpeaker(client as any)

        // Same channel, same suppress flag: this is the state update Discord
        // emits in response to our own setRequestToSpeak call.
        await listeners[0](
            stageState(),
            stageState({ requestToSpeakTimestamp: 12345 }),
        )

        expect(ensureStageSpeakerMock).not.toHaveBeenCalled()
    })

    it('requests to speak on joining a stage and warns the channel', async () => {
        const send = jest.fn<() => Promise<void>>()
        const queue = buildQueue({ send })
        const { client, listeners } = buildClient(queue)
        setupStageSpeaker(client as any)

        await listeners[0]({ channelId: null, suppress: false }, stageState())

        expect(ensureStageSpeakerMock).toHaveBeenCalled()
        expect(send).toHaveBeenCalledWith({
            embeds: [
                expect.objectContaining({
                    kind: 'warning',
                    title: expect.stringContaining('stage approval'),
                }),
            ],
        })
    })

    it('reports an error embed when it cannot speak at all', async () => {
        ensureStageSpeakerMock.mockResolvedValue('blocked')
        const send = jest.fn<() => Promise<void>>()
        const queue = buildQueue({ send })
        const { client, listeners } = buildClient(queue)
        setupStageSpeaker(client as any)

        await listeners[0]({ channelId: null, suppress: false }, stageState())

        expect(send).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({ kind: 'error' })],
        })
    })

    it('stays quiet when it takes the mic on its own', async () => {
        ensureStageSpeakerMock.mockResolvedValue('unsuppressed')
        const send = jest.fn<() => Promise<void>>()
        const queue = buildQueue({ send })
        const { client, listeners } = buildClient(queue)
        setupStageSpeaker(client as any)

        await listeners[0]({ channelId: null, suppress: false }, stageState())

        expect(send).not.toHaveBeenCalled()
    })

    it('pauses a playing queue when a moderator revokes speaker mid-session', async () => {
        const queue = buildQueue({ playing: true })
        const { client, listeners } = buildClient(queue)
        setupStageSpeaker(client as any)

        await listeners[0](
            stageState({ suppress: false }),
            stageState({ suppress: true }),
        )

        expect(queue.node.pause).toHaveBeenCalled()
    })

    it('resumes a paused queue once approved to speak', async () => {
        const queue = buildQueue({ paused: true })
        const { client, listeners } = buildClient(queue)
        setupStageSpeaker(client as any)

        await listeners[0](
            stageState({ suppress: true }),
            stageState({ suppress: false }),
        )

        expect(queue.node.resume).toHaveBeenCalled()
        expect(ensureStageSpeakerMock).not.toHaveBeenCalled()
    })
})
