import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { type GuildQueue, type Track } from 'discord-player'
import {
    lastPlayedTracks,
    recentlyPlayedTracks,
    setupTrackHandlers,
} from './trackHandlers'

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
const clearStatusMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const warnLogMock = jest.fn()
const recordImplicitFeedbackMock = jest.fn()

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

jest.mock('../../utils/music/queueOperations', () => ({
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
        isIntentionalStop: () => false,
    },
}))

jest.mock('../../utils/music/sessionSnapshots', () => ({
    musicSessionSnapshotService: {
        saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
    },
}))

jest.mock('../../services/VoiceChannelStatusService', () => ({
    clearStatus: (...args: unknown[]) => clearStatusMock(...args),
    setTrackStatus: jest.fn(),
}))


jest.mock('@lucky/shared/config', () => ({
    constants: { VOLUME: 50 },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        recordImplicitFeedback: (...args: unknown[]) =>
            recordImplicitFeedbackMock(...args),
    },
}))

jest.mock('../../utils/music/searchQueryCleaner', () => ({
    cleanTitle: (title: string) => title,
    cleanAuthor: (author: string) => author,
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
        lastPlayedTracks.clear()
        recentlyPlayedTracks.clear()
        featureEnabledMock.mockResolvedValue(true)
        replenishQueueMock.mockResolvedValue(undefined)
        addTrackToHistoryMock.mockResolvedValue(undefined)
        sendNowPlayingEmbedMock.mockResolvedValue(undefined)
        updateLastFmNowPlayingMock.mockResolvedValue(undefined)
        scrobbleCurrentTrackIfLastFmMock.mockResolvedValue(undefined)
        saveSnapshotMock.mockResolvedValue(undefined)
        recordImplicitFeedbackMock.mockResolvedValue(undefined)
    })

    afterEach(() => {
        jest.useRealTimers()
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
        expect(replenishQueueMock).toHaveBeenCalledWith(
            queue,
            expect.anything(),
        )
        expect(saveSnapshotMock).toHaveBeenCalledWith(queue)
        expect(watchdogArmMock).toHaveBeenCalledWith(queue)
    })

    it('keeps running after now-playing updates fail and logs the error', async () => {
        sendNowPlayingEmbedMock.mockRejectedValue(new Error('send failed'))

        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const autoplayQueue = createQueue(QueueRepeatMode.AUTOPLAY)
        const autoplayTrack = createAutoplayTrack('listener-5')

        await playerStart(autoplayQueue, autoplayTrack)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error sending now playing message:',
            }),
        )
        expect(saveSnapshotMock).toHaveBeenCalledWith(autoplayQueue)
        expect(watchdogArmMock).toHaveBeenCalledWith(autoplayQueue)
    })

    it('retries queue replenishment after a playerStart failure', async () => {
        jest.useFakeTimers()
        replenishQueueMock.mockRejectedValueOnce(new Error('replenish failed'))
        replenishQueueMock.mockResolvedValueOnce(undefined)

        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const autoplayQueue = createQueue(QueueRepeatMode.AUTOPLAY)
        const autoplayTrack = createAutoplayTrack('listener-7')

        await playerStart(autoplayQueue, autoplayTrack)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Replenish failed, retrying in 5s',
            }),
        )

        jest.advanceTimersByTime(5000)
        await Promise.resolve()

        expect(replenishQueueMock).toHaveBeenCalledTimes(2)
        expect(saveSnapshotMock).toHaveBeenCalledWith(autoplayQueue)
        expect(watchdogArmMock).toHaveBeenCalledWith(autoplayQueue)
    })

    it('logs a failed queue replenishment retry without retrying again', async () => {
        jest.useFakeTimers()
        const initialError = new Error('replenish failed')
        const retryError = new Error('retry failed')
        replenishQueueMock.mockRejectedValueOnce(initialError)
        replenishQueueMock.mockRejectedValueOnce(retryError)

        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const autoplayQueue = createQueue(QueueRepeatMode.AUTOPLAY)

        await playerStart(autoplayQueue, createAutoplayTrack('listener-14'))
        jest.advanceTimersByTime(5000)
        await Promise.resolve()

        expect(replenishQueueMock).toHaveBeenCalledTimes(2)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'Replenish retry failed',
            error: retryError,
            data: { guildId: 'guild-1' },
        })
    })

    it('logs and exits gracefully when playerStart fails before now-playing updates', async () => {
        saveSnapshotMock.mockRejectedValue(new Error('snapshot failed'))

        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const autoplayQueue = createQueue(QueueRepeatMode.AUTOPLAY)
        const autoplayTrack = createAutoplayTrack('listener-8')

        await playerStart(autoplayQueue, autoplayTrack)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in player start handler:',
            }),
        )
    })

    it('clears voice status, presence, and watchdog when playerFinish empties the queue', async () => {
        const handlers = setupHandlers()
        const playerFinish = handlers.playerFinish
        const finishedTrack = createTrack('listener-6')
        const queue = {
            ...createQueue(QueueRepeatMode.OFF),
            currentTrack: null,
            tracks: { size: 0 },
        } as unknown as GuildQueue

        await playerFinish(queue, finishedTrack)

        expect(clearStatusMock).toHaveBeenCalledWith(queue)
        expect(watchdogClearMock).toHaveBeenCalledWith('guild-1')
        expect(watchdogArmMock).not.toHaveBeenCalled()
    })

    it('logs errors from playerFinish without crashing', async () => {
        scrobbleCurrentTrackIfLastFmMock.mockRejectedValue(new Error('boom'))

        const handlers = setupHandlers()
        const playerFinish = handlers.playerFinish
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const finishedTrack = createTrack('listener-10')

        await playerFinish(queue, finishedTrack)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in playerFinish event:',
            }),
        )
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

    it('clears voice status, presence, and watchdog when playerSkip empties the queue', async () => {
        const handlers = setupHandlers()
        const playerSkip = handlers.playerSkip
        const skippedTrack = createTrack('listener-11')
        const queue = {
            ...createQueue(QueueRepeatMode.OFF),
            currentTrack: null,
            tracks: { size: 0 },
        } as unknown as GuildQueue

        await playerSkip(queue, skippedTrack)

        expect(clearStatusMock).toHaveBeenCalledWith(queue)
        expect(watchdogClearMock).toHaveBeenCalledWith('guild-1')
        expect(watchdogArmMock).not.toHaveBeenCalled()
    })

    it('logs errors from playerSkip without crashing', async () => {
        scrobbleCurrentTrackIfLastFmMock.mockRejectedValue(new Error('boom'))

        const handlers = setupHandlers()
        const playerSkip = handlers.playerSkip
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const skippedTrack = createTrack('listener-12')

        await playerSkip(queue, skippedTrack)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in playerSkip event:',
            }),
        )
    })

    it('evicts old track entries when playerStart runs beyond the per-guild cap', async () => {
        for (let index = 0; index < 501; index += 1) {
            lastPlayedTracks.set(
                `guild-${index}`,
                createTrack(`listener-${index}`),
            )
        }
        recentlyPlayedTracks.set(
            'guild-1',
            Array.from({ length: 501 }, (_, index) => ({
                url: `https://example.com/${index}`,
                title: `Song ${index}`,
                author: 'Artist',
                timestamp: index,
            })),
        )

        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)

        await playerStart(queue, createTrack('listener-overflow'))

        expect(lastPlayedTracks.size).toBe(500)
        expect(lastPlayedTracks.has('guild-0')).toBe(false)
        expect(recentlyPlayedTracks.get('guild-1')).toHaveLength(500)
    })

    it('logs the first added track when audio tracks are appended to the queue', async () => {
        const handlers = setupHandlers()
        const audioTracksAdd = handlers.audioTracksAdd
        const queue = createQueue(QueueRepeatMode.OFF)
        const addedTrack = createTrack('listener-13')

        await audioTracksAdd(queue, [addedTrack])

        expect(infoLogMock).toHaveBeenCalledWith({
            message: 'Added "Test Song" to queue in Guild One',
        })
    })

    it('records implicit like on playerFinish when track played > 80%', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const playerFinish = handlers.playerFinish
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const finishedTrack = {
            ...createTrack('listener-finish-1'),
            durationMS: 100000,
        }

        await playerStart(queue, finishedTrack)
        jest.advanceTimersByTime(85000)
        await playerFinish(queue, finishedTrack)

        expect(recordImplicitFeedbackMock).toHaveBeenCalledWith(
            'listener-finish-1',
            'testsong::testartist',
            'implicit_like',
        )
    })

    it('does not record feedback on playerFinish when track played < 80%', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const playerFinish = handlers.playerFinish
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const finishedTrack = {
            ...createTrack('listener-finish-2'),
            durationMS: 100000,
        }

        await playerStart(queue, finishedTrack)
        jest.advanceTimersByTime(60000)
        await playerFinish(queue, finishedTrack)

        expect(recordImplicitFeedbackMock).not.toHaveBeenCalled()
    })

    it('records implicit dislike on playerSkip when track played < 30%', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const playerSkip = handlers.playerSkip
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const skippedTrack = {
            ...createTrack('listener-skip-1'),
            durationMS: 100000,
        }

        await playerStart(queue, skippedTrack)
        jest.advanceTimersByTime(20000)
        await playerSkip(queue, skippedTrack)

        expect(recordImplicitFeedbackMock).toHaveBeenCalledWith(
            'listener-skip-1',
            'testsong::testartist',
            'implicit_dislike',
        )
    })

    it('does not record feedback on playerSkip when track < 20 seconds duration', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const playerSkip = handlers.playerSkip
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const shortTrack = {
            ...createTrack('listener-skip-2'),
            durationMS: 10000,
        }

        await playerStart(queue, shortTrack)
        jest.advanceTimersByTime(5000)
        await playerSkip(queue, shortTrack)

        expect(recordImplicitFeedbackMock).not.toHaveBeenCalled()
    })

    it('does not record feedback on playerSkip when track played > 30%', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const playerSkip = handlers.playerSkip
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const skippedTrack = {
            ...createTrack('listener-skip-3'),
            durationMS: 100000,
        }

        await playerStart(queue, skippedTrack)
        jest.advanceTimersByTime(50000)
        await playerSkip(queue, skippedTrack)

        expect(recordImplicitFeedbackMock).not.toHaveBeenCalled()
    })

    it('records implicit like for track with metadata requestedById on playerFinish', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const playerStart = handlers.playerStart
        const playerFinish = handlers.playerFinish
        const queue = createQueue(QueueRepeatMode.AUTOPLAY)
        const metadataTrack = {
            id: 'track-3',
            title: 'Metadata Track',
            author: 'Metadata Artist',
            url: 'https://example.com/track-3',
            source: 'youtube',
            requestedBy: undefined,
            metadata: {
                requestedById: 'listener-finish-3',
            },
            durationMS: 100000,
        } as unknown as Track

        await playerStart(queue, metadataTrack)
        jest.advanceTimersByTime(85000)
        await playerFinish(queue, metadataTrack)

        expect(recordImplicitFeedbackMock).toHaveBeenCalledWith(
            'listener-finish-3',
            'metadatatrack::metadataartist',
            'implicit_like',
        )
    })
})
