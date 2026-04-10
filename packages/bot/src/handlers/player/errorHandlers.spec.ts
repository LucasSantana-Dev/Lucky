import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { setupErrorHandlers } from './errorHandlers'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const analyzeYouTubeErrorMock = jest.fn()
const logYouTubeErrorMock = jest.fn()
const recordFailureMock = jest.fn()
const recordSuccessMock = jest.fn()
const providerFromTrackMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../utils/music/youtubeErrorHandler', () => ({
    analyzeYouTubeError: (...args: unknown[]) =>
        analyzeYouTubeErrorMock(...args),
    logYouTubeError: (...args: unknown[]) => logYouTubeErrorMock(...args),
}))

jest.mock('@lucky/shared/config', () => ({
    youtubeConfig: {
        errorHandling: { skipOnParserError: true },
    },
}))

jest.mock('../../utils/music/search/providerHealth', () => ({
    providerFromTrack: (...args: unknown[]) => providerFromTrackMock(...args),
    providerHealthService: {
        recordFailure: (...args: unknown[]) => recordFailureMock(...args),
        recordSuccess: (...args: unknown[]) => recordSuccessMock(...args),
    },
}))

type QueueErrorHandler = (queue: any, error: Error) => void
type PlayerErrorHandler = (queue: any, error: Error, track?: any) => unknown
type DebugHandler = (queue: any, message: string) => void
type TopLevelErrorHandler = (error: Error) => void
type TopLevelDebugHandler = (message: string) => void

async function flushPromises(): Promise<void> {
    await new Promise<void>((resolve) => {
        setImmediate(() => resolve())
    })
}

function createPlayerWithHandlers(): {
    queueHandlers: Record<
        string,
        QueueErrorHandler | PlayerErrorHandler | DebugHandler
    >
    playerHandlers: Record<string, TopLevelErrorHandler | TopLevelDebugHandler>
} {
    const queueHandlers: Record<
        string,
        QueueErrorHandler | PlayerErrorHandler | DebugHandler
    > = {}
    const playerHandlers: Record<
        string,
        TopLevelErrorHandler | TopLevelDebugHandler
    > = {}
    const player = {
        events: {
            on: jest.fn(
                (
                    event: string,
                    handler:
                        | QueueErrorHandler
                        | PlayerErrorHandler
                        | DebugHandler,
                ) => {
                    queueHandlers[event] = handler
                },
            ),
        },
        on: jest.fn(
            (
                event: string,
                handler: TopLevelErrorHandler | TopLevelDebugHandler,
            ) => {
                playerHandlers[event] = handler
            },
        ),
    }

    setupErrorHandlers(player as any)
    return { queueHandlers, playerHandlers }
}

describe('setupErrorHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        analyzeYouTubeErrorMock.mockReturnValue({
            isParserError: false,
            isCompositeVideoError: false,
            isHypePointsError: false,
            isTypeMismatchError: false,
        })
        providerFromTrackMock.mockReturnValue('youtube')
    })

    it('records provider failure and recovers stream extraction with alternative track', async () => {
        const queueHandlers: Record<
            string,
            QueueErrorHandler | PlayerErrorHandler | DebugHandler
        > = {}
        const playerHandlers: Record<
            string,
            TopLevelErrorHandler | TopLevelDebugHandler
        > = {}
        const player = {
            events: {
                on: jest.fn(
                    (
                        event: string,
                        handler:
                            | QueueErrorHandler
                            | PlayerErrorHandler
                            | DebugHandler,
                    ) => {
                        queueHandlers[event] = handler
                    },
                ),
            },
            on: jest.fn(
                (
                    event: string,
                    handler: TopLevelErrorHandler | TopLevelDebugHandler,
                ) => {
                    playerHandlers[event] = handler
                },
            ),
        }
        setupErrorHandlers(player as any)

        const alternativeTrack = { url: 'https://example.com/alt' }
        const queue = {
            guild: { name: 'Guild 1' },
            metadata: { requestedBy: { id: 'user-1' } },
            currentTrack: {
                url: 'https://example.com/current',
                title: 'Song A',
                requestedBy: { id: 'user-1' },
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [alternativeTrack],
                }),
            },
            insertTrack: jest.fn(),
            node: {
                skip: jest.fn(),
            },
        }

        expect(playerHandlers.error).toEqual(expect.any(Function))
        expect(playerHandlers.debug).toEqual(expect.any(Function))
        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queue as any,
            new Error('Could not extract stream'),
        )
        await flushPromises()

        expect(recordFailureMock).toHaveBeenCalledWith(
            'youtube',
            expect.any(Number),
            'Could not extract stream',
        )
        expect(queue.player.search).toHaveBeenCalled()
        expect(queue.insertTrack).toHaveBeenCalledWith(alternativeTrack, 0)
        expect(queue.node.skip).toHaveBeenCalled()
        expect(recordSuccessMock).toHaveBeenCalledWith('youtube')
    })

    it('skips track on parser errors when skip config is enabled', async () => {
        const queueHandlers: Record<
            string,
            QueueErrorHandler | PlayerErrorHandler | DebugHandler
        > = {}
        const playerHandlers: Record<
            string,
            TopLevelErrorHandler | TopLevelDebugHandler
        > = {}
        const player = {
            events: {
                on: jest.fn(
                    (
                        event: string,
                        handler:
                            | QueueErrorHandler
                            | PlayerErrorHandler
                            | DebugHandler,
                    ) => {
                        queueHandlers[event] = handler
                    },
                ),
            },
            on: jest.fn(
                (
                    event: string,
                    handler: TopLevelErrorHandler | TopLevelDebugHandler,
                ) => {
                    playerHandlers[event] = handler
                },
            ),
        }
        setupErrorHandlers(player as any)
        analyzeYouTubeErrorMock.mockReturnValue({
            isParserError: true,
            isCompositeVideoError: false,
            isHypePointsError: false,
            isTypeMismatchError: true,
        })

        const queue = {
            guild: { name: 'Guild 2' },
            metadata: { requestedBy: { id: 'user-2' } },
            currentTrack: {
                url: 'https://example.com/current',
                requestedBy: { id: 'user-2' },
            },
            node: { skip: jest.fn() },
        }

        expect(playerHandlers.error).toEqual(expect.any(Function))
        expect(playerHandlers.debug).toEqual(expect.any(Function))
        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queue as any,
            new Error('parser failed'),
        )
        await flushPromises()

        expect(logYouTubeErrorMock).toHaveBeenCalled()
        expect(queue.node.skip).toHaveBeenCalled()
    })

    it('handles top-level player errors and queue errors without throwing', () => {
        const { queueHandlers, playerHandlers } = createPlayerWithHandlers()

        const queue = {
            guild: { id: 'guild-1', name: 'Guild 1' },
            connection: {
                state: { status: 'disconnected' },
                rejoin: jest.fn(() => {
                    throw new Error('rejoin failed')
                }),
            },
        }

        expect(() =>
            (queueHandlers.error as QueueErrorHandler)(
                queue,
                new Error('ECONNRESET test'),
            ),
        ).not.toThrow()
        expect(() =>
            (playerHandlers.error as TopLevelErrorHandler)(
                new Error('Unhandled player error'),
            ),
        ).not.toThrow()

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Unhandled player error:',
                data: expect.objectContaining({
                    errorMessage: 'Unhandled player error',
                }),
            }),
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in queue Guild 1:',
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    errorMessage: 'ECONNRESET test',
                }),
            }),
        )
    })

    it('normalizes non-error queue payloads and recovers connection when rejoin works', () => {
        const { queueHandlers } = createPlayerWithHandlers()
        const queue = {
            guild: { id: 'guild-raw', name: 'Guild Raw' },
            connection: {
                state: { status: 'disconnected' },
                rejoin: jest.fn(),
            },
        }

        ;(queueHandlers.error as QueueErrorHandler)(
            queue as any,
            'ECONNRESET' as any,
        )

        expect(queue.connection.rejoin).toHaveBeenCalled()
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in queue Guild Raw:',
                data: expect.objectContaining({
                    errorName: 'string',
                    errorMessage: 'ECONNRESET',
                }),
            }),
        )
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Attempting to recover from connection error',
            }),
        )
    })

    it('guards queue and top-level debug handlers when debug logging throws', () => {
        const { queueHandlers, playerHandlers } = createPlayerWithHandlers()
        debugLogMock.mockImplementation(() => {
            throw new Error('debug failed')
        })
        ;(queueHandlers.debug as DebugHandler)(
            { guild: { name: 'Guild Debug' } },
            'queue-debug',
        )
        ;(playerHandlers.debug as TopLevelDebugHandler)('runtime-debug')

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Player queue debug handler failed:',
                data: expect.objectContaining({ errorMessage: 'debug failed' }),
            }),
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Player top-level debug handler failed:',
                data: expect.objectContaining({ errorMessage: 'debug failed' }),
            }),
        )
    })

    it('skips when stream recovery has no requester, no tracks, no alternative, or no current track', async () => {
        const { queueHandlers } = createPlayerWithHandlers()
        const streamError = new Error('Could not extract stream')

        const queueNoRequester = {
            guild: { id: 'guild-a', name: 'Guild A' },
            metadata: {},
            currentTrack: {
                url: 'https://example.com/current',
                title: 'Song A',
            },
            player: { search: jest.fn() },
            node: {
                isPlaying: jest.fn(() => false),
                play: jest.fn(),
                skip: jest.fn(),
            },
            removeTrack: jest.fn(),
            addTrack: jest.fn(),
        }

        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queueNoRequester as any,
            streamError,
        )
        await flushPromises()
        expect(queueNoRequester.node.skip).toHaveBeenCalled()
        expect(queueNoRequester.player.search).not.toHaveBeenCalled()

        const queueNoTracks = {
            ...queueNoRequester,
            metadata: { requestedBy: { id: 'user-a' } },
            currentTrack: {
                url: 'https://example.com/current',
                title: 'Song B',
                requestedBy: { id: 'user-a' },
            },
            player: { search: jest.fn().mockResolvedValue({ tracks: [] }) },
            node: {
                isPlaying: jest.fn(() => false),
                play: jest.fn(),
                skip: jest.fn(),
            },
            removeTrack: jest.fn(),
            addTrack: jest.fn(),
        }

        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queueNoTracks as any,
            streamError,
        )
        await flushPromises()
        expect(queueNoTracks.node.skip).toHaveBeenCalled()

        const queueNoAlternative = {
            ...queueNoTracks,
            currentTrack: {
                url: 'https://example.com/current',
                title: 'Song C',
                requestedBy: { id: 'user-a' },
            },
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [{ url: 'https://example.com/current' }],
                }),
            },
            node: {
                isPlaying: jest.fn(() => true),
                play: jest.fn(),
                skip: jest.fn(),
            },
            removeTrack: jest.fn(),
            addTrack: jest.fn(),
        }

        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queueNoAlternative as any,
            streamError,
        )
        await flushPromises()
        expect(queueNoAlternative.node.skip).toHaveBeenCalled()

        const queueNoCurrentTrack = {
            ...queueNoTracks,
            currentTrack: null,
            node: {
                isPlaying: jest.fn(() => false),
                play: jest.fn(),
                skip: jest.fn(),
            },
        }

        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queueNoCurrentTrack as any,
            streamError,
        )
        await flushPromises()
        expect(queueNoCurrentTrack.node.skip).toHaveBeenCalled()
    })

    it('logs and swallows unexpected failures inside player error handling', async () => {
        const { queueHandlers } = createPlayerWithHandlers()
        providerFromTrackMock.mockImplementationOnce(() => {
            throw new Error('provider lookup failed')
        })
        const queue = {
            guild: { id: 'guild-x', name: 'Guild X' },
            currentTrack: {
                url: 'https://example.com/current',
                title: 'Song X',
            },
            node: { skip: jest.fn() },
        }

        ;(queueHandlers.playerError as PlayerErrorHandler)(
            queue as any,
            new Error('Could not extract stream'),
        )
        await flushPromises()

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error in player error handler:',
                data: expect.objectContaining({
                    errorMessage: 'provider lookup failed',
                }),
            }),
        )
    })
})
