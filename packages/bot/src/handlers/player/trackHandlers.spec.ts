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
        clearSnapshotIfStale: jest.fn().mockResolvedValue(undefined),
    },
}))

jest.mock('../../utils/music/replenishSuppressionStore', () => ({
    isReplenishSuppressed: jest.fn(() => false),
    setReplenishSuppressed: jest.fn(),
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













    it('evicts old track entries when playerStart runs beyond the per-guild cap', async () => {
        for (let index = 0; index < 501; index += 1) {
            lastPlayedTracks.set(
                `guild-${index}`,
                createTrack(`listener-${index}`),
            )
        }
        for (let index = 0; index < 501; index += 1) {
            recentlyPlayedTracks.set(`history-guild-${index}`, [
                {
                    url: `https://example.com/history/${index}`,
                    title: `History Song ${index}`,
                    author: 'Artist',
                    timestamp: index,
                },
            ])
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
        expect(recentlyPlayedTracks.size).toBe(500)
        expect(recentlyPlayedTracks.has('history-guild-0')).toBe(false)
        expect(recentlyPlayedTracks.get('guild-1')).toHaveLength(500)
    })







})
