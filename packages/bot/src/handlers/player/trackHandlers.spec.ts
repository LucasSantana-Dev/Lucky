import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { type GuildQueue, type Track } from 'discord-player'
import { setupTrackHandlers } from './trackHandlers'

const QueueRepeatMode = {
    OFF: 0,
    QUEUE: 2,
    AUTOPLAY: 3,
} as const

const featureEnabledMock = jest.fn()
const replenishQueueMock = jest.fn()
const addTrackToHistoryMock = jest.fn()
const sendNowPlayingEmbedMock = jest.fn()
const updateLastFmNowPlayingMock = jest.fn()
const scrobbleCurrentTrackIfLastFmMock = jest.fn()
const resetAutoplayCountMock = jest.fn()
const watchdogArmMock = jest.fn()
const watchdogClearMock = jest.fn()
const saveSnapshotMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('discord-player', () => ({
    QueueRepeatMode: {
        OFF: 0,
        QUEUE: 2,
        AUTOPLAY: 3,
    },
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: (...args: unknown[]) => featureEnabledMock(...args),
    },
}))

jest.mock('../../utils/music/trackManagement/queueOperations', () => ({
    replenishQueue: (...args: unknown[]) => replenishQueueMock(...args),
}))

jest.mock('../../utils/music/duplicateDetection', () => ({
    addTrackToHistory: (...args: unknown[]) => addTrackToHistoryMock(...args),
}))

jest.mock('./trackNowPlaying', () => ({
    sendNowPlayingEmbed: (...args: unknown[]) =>
        sendNowPlayingEmbedMock(...args),
    updateLastFmNowPlaying: (...args: unknown[]) =>
        updateLastFmNowPlayingMock(...args),
    scrobbleCurrentTrackIfLastFm: (...args: unknown[]) =>
        scrobbleCurrentTrackIfLastFmMock(...args),
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    resetAutoplayCount: (...args: unknown[]) => resetAutoplayCountMock(...args),
}))

jest.mock('../../utils/music/watchdog', () => ({
    musicWatchdogService: {
        arm: (...args: unknown[]) => watchdogArmMock(...args),
        clear: (...args: unknown[]) => watchdogClearMock(...args),
    },
}))

jest.mock('../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
    },
}))

jest.mock('@lucky/shared/config', () => ({
    constants: { VOLUME: 50 },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

type PlayerEventHandler = (queue: GuildQueue, track?: Track) => Promise<void>

function createTrack(requestedById = 'listener-1'): Track {
    return {
        id: 'track-1',
        title: 'Test Song',
        author: 'Test Artist',
        url: 'https://example.com/track-1',
        source: 'youtube',
        requestedBy: { id: requestedById },
    } as unknown as Track
}

function createAutoplayTrack(requestedById = 'listener-1'): Track {
    return {
        id: 'track-2',
        title: 'Autoplay Song',
        author: 'Autoplay Artist',
        url: 'https://example.com/track-2',
        source: 'youtube',
        metadata: {
            isAutoplay: true,
            requestedById,
            recommendationReason: 'Because you listened to Test Song',
        },
    } as unknown as Track
}

function createQueue(repeatMode: QueueRepeatMode): GuildQueue {
    return {
        guild: {
            id: 'guild-1',
            name: 'Guild One',
        },
        node: {
            volume: 20,
            setVolume: jest.fn(),
        },
        tracks: {
            size: 1,
        },
        repeatMode,
    } as unknown as GuildQueue
}

function setupHandlers(
    botUserId = 'bot-1',
): Record<string, PlayerEventHandler> {
    const handlers: Record<string, PlayerEventHandler> = {}
    const player = {
        events: {
            on: jest.fn((event: string, handler: PlayerEventHandler) => {
                handlers[event] = handler
            }),
        },
    }

    setupTrackHandlers({
        player,
        client: { user: { id: botUserId } },
    })

    return handlers
}

describe('trackHandlers autoplay replenishment', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        featureEnabledMock.mockResolvedValue(true)
        replenishQueueMock.mockResolvedValue(undefined)
        addTrackToHistoryMock.mockResolvedValue(undefined)
        sendNowPlayingEmbedMock.mockResolvedValue(undefined)
        updateLastFmNowPlayingMock.mockResolvedValue(undefined)
        scrobbleCurrentTrackIfLastFmMock.mockResolvedValue(undefined)
        saveSnapshotMock.mockResolvedValue(undefined)
    })

    it('replenishes queue on playerStart only when repeat mode is autoplay', async () => {
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const autoplayQueue = createQueue(QueueRepeatMode.AUTOPLAY)
        const manualTrack = createTrack('listener-1')

        await playerStart(autoplayQueue, manualTrack)

        expect(featureEnabledMock).toHaveBeenCalledWith('AUTOPLAY', {
            guildId: 'guild-1',
            userId: 'listener-1',
        })
        expect(replenishQueueMock).toHaveBeenCalledWith(autoplayQueue)
        expect(saveSnapshotMock).toHaveBeenCalledWith(autoplayQueue)
        expect(watchdogArmMock).toHaveBeenCalledWith(autoplayQueue)

        replenishQueueMock.mockClear()
        featureEnabledMock.mockClear()

        const queueModeQueue = createQueue(QueueRepeatMode.QUEUE)
        await playerStart(queueModeQueue, manualTrack)

        expect(featureEnabledMock).toHaveBeenCalledWith('AUTOPLAY', {
            guildId: 'guild-1',
            userId: 'listener-1',
        })
        expect(replenishQueueMock).not.toHaveBeenCalled()
    })

    it('treats metadata-tagged autoplay tracks as autoplay on playerStart', async () => {
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const autoplayQueue = createQueue(QueueRepeatMode.AUTOPLAY)
        const autoplayTrack = createAutoplayTrack('listener-9')

        await playerStart(autoplayQueue, autoplayTrack)

        expect(sendNowPlayingEmbedMock).toHaveBeenCalledWith(
            autoplayQueue,
            autoplayTrack,
            true,
        )
        expect(featureEnabledMock).toHaveBeenCalledWith('AUTOPLAY', {
            guildId: 'guild-1',
            userId: 'listener-9',
        })
        expect(replenishQueueMock).toHaveBeenCalledWith(autoplayQueue)
    })

    it('replenishes and records track on playerFinish when autoplay is enabled', async () => {
        const handlers = setupHandlers()
        const playerFinish = handlers.playerFinish
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const finishedTrack = createTrack('listener-2')
        queue.currentTrack = finishedTrack

        await playerFinish(queue, finishedTrack)

        expect(scrobbleCurrentTrackIfLastFmMock).toHaveBeenCalledWith(
            queue,
            finishedTrack,
        )
        expect(addTrackToHistoryMock).toHaveBeenCalledWith(
            finishedTrack,
            'guild-1',
        )
        expect(featureEnabledMock).toHaveBeenCalledWith('AUTOPLAY', {
            guildId: 'guild-1',
            userId: undefined,
        })
        expect(replenishQueueMock).toHaveBeenCalledWith(queue)
        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
    })

    it('does not replenish on playerSkip when autoplay feature is disabled', async () => {
        featureEnabledMock.mockResolvedValue(false)

        const handlers = setupHandlers()
        const playerSkip = handlers.playerSkip
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const skippedTrack = createTrack('listener-3')
        queue.currentTrack = skippedTrack

        await playerSkip(queue, skippedTrack)

        expect(scrobbleCurrentTrackIfLastFmMock).toHaveBeenCalledWith(
            queue,
            skippedTrack,
        )
        expect(addTrackToHistoryMock).toHaveBeenCalledWith(
            skippedTrack,
            'guild-1',
        )
        expect(featureEnabledMock).toHaveBeenCalledWith('AUTOPLAY', {
            guildId: 'guild-1',
            userId: undefined,
        })
        expect(replenishQueueMock).not.toHaveBeenCalled()
        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
    })
})
