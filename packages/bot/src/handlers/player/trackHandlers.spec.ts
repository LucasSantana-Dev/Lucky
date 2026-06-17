import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { type GuildQueue, type Track } from 'discord-player'
import {
    lastPlayedTracks,
    recentlyPlayedTracks,
    setupTrackHandlers,
    getRecentSkipCount,
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

const recordRecommendationOutcomeMock = jest.fn()
jest.mock('../../services/musicRecommendation/recommendationTelemetry', () => ({
    recordRecommendationOutcome: (...args: unknown[]) =>
        recordRecommendationOutcomeMock(...args),
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
        recordRecommendationOutcomeMock.mockResolvedValue(undefined)
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

    it('increments getRecentSkipCount on early skip and resets on track completion', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const queue = {
            ...createQueue(QueueRepeatMode.AUTOPLAY),
            guild: { id: 'guild-skip-count', name: 'Skip Count Guild' },
        } as unknown as GuildQueue
        const track = { ...createTrack('skip-count-user'), durationMS: 100000 }

        await handlers.playerStart(queue, track)
        jest.advanceTimersByTime(10000) // 10% through — early skip
        await handlers.playerSkip(queue, track)
        expect(getRecentSkipCount(queue.guild.id)).toBe(1)

        // Another early skip increments further
        await handlers.playerStart(queue, track)
        jest.advanceTimersByTime(10000)
        await handlers.playerSkip(queue, track)
        expect(getRecentSkipCount(queue.guild.id)).toBe(2)

        // Completing a track (>80%) resets the counter
        await handlers.playerStart(queue, track)
        jest.advanceTimersByTime(90000)
        await handlers.playerFinish(queue, track)
        expect(getRecentSkipCount(queue.guild.id)).toBe(0)
    })

    it('does not increment getRecentSkipCount when skip is after 30% of track', async () => {
        jest.useFakeTimers()
        const handlers = setupHandlers()
        const queue = {
            ...createQueue(QueueRepeatMode.AUTOPLAY),
            guild: { id: 'guild-skip-late', name: 'Skip Late Guild' },
        } as unknown as GuildQueue
        const track = { ...createTrack('skip-late-user'), durationMS: 100000 }

        await handlers.playerStart(queue, track)
        jest.advanceTimersByTime(50000) // 50% through — late skip
        await handlers.playerSkip(queue, track)
        expect(getRecentSkipCount(queue.guild.id)).toBe(0)
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

    describe('autoplay recommendation outcome recording', () => {
        it('records accepted outcome on playerFinish when autoplay track played past 30%', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerFinish = handlers.playerFinish
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const autoplayTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-track-1',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, autoplayTrack)
            jest.advanceTimersByTime(35000) // 35% through track
            await playerFinish(queue, autoplayTrack)

            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'autoplay-track-1',
                outcome: 'accepted',
            })
        })

        it('records rejected outcome on playerSkip when autoplay track skipped within 5s', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerSkip = handlers.playerSkip
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const autoplayTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-track-2',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, autoplayTrack)
            jest.advanceTimersByTime(3000) // 3s into track
            await playerSkip(queue, autoplayTrack)

            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'autoplay-track-2',
                outcome: 'rejected',
            })
        })

        it('records rejected outcome on playerSkip when autoplay track skipped before 30% (the prior dead zone)', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerSkip = handlers.playerSkip
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const autoplayTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-track-3',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, autoplayTrack)
            jest.advanceTimersByTime(15000) // 15% — was the lost "ambiguous" band
            await playerSkip(queue, autoplayTrack)

            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'autoplay-track-3',
                outcome: 'rejected',
            })
        })

        it('does not record outcome for an ambiguous skip after 30%', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerSkip = handlers.playerSkip
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const autoplayTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-track-3b',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, autoplayTrack)
            jest.advanceTimersByTime(55000) // 55% — meaningful listen, ambiguous
            await playerSkip(queue, autoplayTrack)

            expect(recordRecommendationOutcomeMock).not.toHaveBeenCalled()
        })

        it('records rejected outcome on playerFinish when an autoplay track ends at or below 30% (skip routed through finish)', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerFinish = handlers.playerFinish
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const autoplayTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-track-finish-reject',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, autoplayTrack)
            jest.advanceTimersByTime(12000) // 12% — early end / skip via finish
            await playerFinish(queue, autoplayTrack)

            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'autoplay-track-finish-reject',
                outcome: 'rejected',
            })
        })

        it('records outcomes for short (≤20s) autoplay tracks too — consistent across paths', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerSkip = handlers.playerSkip
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const shortTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-short-1',
                durationMS: 15000, // ≤20s — previously suppressed on the skip path
            } as unknown as Track

            await playerStart(queue, shortTrack)
            jest.advanceTimersByTime(2000) // ~13% in
            await playerSkip(queue, shortTrack)

            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'autoplay-short-1',
                outcome: 'rejected',
            })
        })

        it('does not record outcome for non-autoplay tracks on playerFinish', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerFinish = handlers.playerFinish
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const manualTrack = {
                ...createTrack('listener-1'),
                id: 'manual-track-1',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, manualTrack)
            jest.advanceTimersByTime(85000)
            await playerFinish(queue, manualTrack)

            expect(recordRecommendationOutcomeMock).not.toHaveBeenCalled()
        })

        it('does not record outcome for non-autoplay tracks on playerSkip', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerSkip = handlers.playerSkip
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const manualTrack = {
                ...createTrack('listener-1'),
                id: 'manual-track-2',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, manualTrack)
            jest.advanceTimersByTime(3000)
            await playerSkip(queue, manualTrack)

            expect(recordRecommendationOutcomeMock).not.toHaveBeenCalled()
        })

        it('does not record outcome for autoplay track skipped after 30% completion', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const playerStart = handlers.playerStart
            const playerSkip = handlers.playerSkip
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const autoplayTrack = {
                ...createAutoplayTrack('listener-1'),
                id: 'autoplay-track-4',
                durationMS: 100000,
            } as unknown as Track

            await playerStart(queue, autoplayTrack)
            jest.advanceTimersByTime(35000) // 35% through (past the 30% threshold)
            await playerSkip(queue, autoplayTrack)

            expect(recordRecommendationOutcomeMock).not.toHaveBeenCalled()
        })
    })

    // #1275 probe: prod shows 0 rejected all-time despite a working accepted
    // path. The isolated tests above pass, so the per-event logic is correct.
    // These exercise the REALISTIC continuous-autoplay sequencing where the
    // next track's playerStart interleaves with the previous track's terminal
    // event — guildTrackStartTimes is keyed per-GUILD (one timestamp shared
    // across overlapping track lifecycles), which the isolated tests never hit.
    describe('interleaved continuous-autoplay sequencing (#1275 probe)', () => {
        const autoplay = (id: string) =>
            ({
                ...createAutoplayTrack('listener-1'),
                id,
                durationMS: 100000,
            }) as unknown as Track

        it('records rejected for an early skip that follows a completed track (finish→start→skip order)', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const trackA = autoplay('seq-A')
            const trackB = autoplay('seq-B')

            await handlers.playerStart(queue, trackA)
            jest.advanceTimersByTime(90000) // A plays to 90%
            await handlers.playerFinish(queue, trackA) // accepted, clears startTime
            await handlers.playerStart(queue, trackB) // startTime reset for B
            jest.advanceTimersByTime(10000) // B plays 10%
            await handlers.playerSkip(queue, trackB)

            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'seq-A',
                outcome: 'accepted',
            })
            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith({
                guildId: 'guild-1',
                trackId: 'seq-B',
                outcome: 'rejected',
            })
        })

        it('records rejected when the next track starts BEFORE the skip event fires (start→start→skip order)', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const trackA = autoplay('race-A')
            const trackB = autoplay('race-B')

            await handlers.playerStart(queue, trackA)
            jest.advanceTimersByTime(10000) // A plays 10%, user skips
            // discord-player advances to B before emitting skip for A
            await handlers.playerStart(queue, trackB)
            await handlers.playerSkip(queue, trackA)

            // A was skipped early — it must register as a rejection, not vanish.
            expect(recordRecommendationOutcomeMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    trackId: 'race-A',
                    outcome: 'rejected',
                }),
            )
        })

        it('does NOT misrecord a completed track as rejected when the next track starts before its finish event (start→start→finish order)', async () => {
            jest.useFakeTimers()
            const handlers = setupHandlers()
            const queue = createQueue(QueueRepeatMode.AUTOPLAY)
            const trackA = autoplay('mis-A')
            const trackB = autoplay('mis-B')

            await handlers.playerStart(queue, trackA)
            jest.advanceTimersByTime(90000) // A plays to 90% — a clear ACCEPT
            // next track begins before A's (buffered) finish event arrives
            await handlers.playerStart(queue, trackB)
            await handlers.playerFinish(queue, trackA)

            // A genuinely completed; the shared per-guild startTime must not
            // cause it to be misclassified as a rejection.
            expect(recordRecommendationOutcomeMock).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    trackId: 'mis-A',
                    outcome: 'rejected',
                }),
            )
        })
    })
})
