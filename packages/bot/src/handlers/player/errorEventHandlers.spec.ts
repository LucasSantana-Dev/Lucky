import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { setupErrorHandlers, handlePlayerError } from './errorEventHandlers'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const captureExceptionMock = jest.fn()
const notifyChannelStreamFailedMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

jest.mock('../../services/musicManagement/search/providerHealth', () => ({
    providerFromTrack: jest.fn(() => 'youtube'),
    providerHealthService: {
        recordFailure: jest.fn(),
    },
}))

jest.mock('./errorClassification', () => ({
    toErrorDetails: (error: unknown) => {
        if (error instanceof Error) {
            return {
                errorMessage: error.message,
                errorName: error.name,
                errorStack: error.stack,
            }
        }
        return {
            errorMessage: String(error),
            errorName: typeof error,
        }
    },
    toErrorInstance: (error: unknown) =>
        error instanceof Error ? error : undefined,
    runSafely: (message: string, fn: () => void) => {
        try {
            fn()
        } catch (err) {
            errorLogMock({ message, error: err })
        }
    },
    logHandlerFailure: jest.fn(),
}))

jest.mock('./streamFailureNotifier', () => ({
    notifyChannelStreamFailed: (...args: unknown[]) =>
        notifyChannelStreamFailedMock(...args),
}))

jest.mock('./streamRecovery', () => ({
    handleYouTubeParserError: jest.fn(),
    recoverFromStreamExtractionError: jest.fn(),
}))

jest.mock('../../services/musicManagement/youtubeErrorHandler', () => ({
    analyzeYouTubeError: () => ({
        isParserError: false,
        isCompositeVideoError: false,
        isHypePointsError: false,
        isTypeMismatchError: false,
    }),
}))

type QueueErrorHandler = (queue: any, error: Error) => void
type PlayerErrorHandler = (queue: any, error: Error, track?: any) => unknown
type DebugHandler = (queue: any, message: string) => void
type TopLevelErrorHandler = (error: Error) => void
type TopLevelDebugHandler = (message: string) => void

describe('errorEventHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('handles top-level player errors and queue errors without throwing', () => {
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
                message: expect.stringContaining('Error in queue'),
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    errorMessage: 'ECONNRESET test',
                }),
            }),
        )
        // Both top-level and queue player errors must reach Sentry.
        expect(captureExceptionMock).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ context: 'player-unhandled-error' }),
        )
        expect(captureExceptionMock).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({
                context: 'player-queue-error',
                guildId: 'guild-1',
            }),
        )
    })

    it('recovers connection when rejoin works on ECONNRESET', () => {
        const queueHandlers: Record<
            string,
            QueueErrorHandler | PlayerErrorHandler | DebugHandler
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
            on: jest.fn(),
        }

        setupErrorHandlers(player as any)

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
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Attempting to recover from connection error',
            }),
        )
    })

    it('wraps a non-Error top-level player payload before capturing it', () => {
        const playerHandlers: Record<
            string,
            TopLevelErrorHandler | TopLevelDebugHandler
        > = {}
        const player = {
            events: {
                on: jest.fn(),
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

        ;(playerHandlers.error as TopLevelErrorHandler)('raw failure' as any)

        expect(captureExceptionMock).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ context: 'player-unhandled-error' }),
        )
    })

    it('emits setup event handlers for queue error, playerError, and debug', () => {
        const eventsOnMock = jest.fn()
        const player = {
            events: {
                on: eventsOnMock,
            },
            on: jest.fn(),
        }

        setupErrorHandlers(player as any)

        expect(eventsOnMock).toHaveBeenCalledWith('error', expect.any(Function))
        expect(eventsOnMock).toHaveBeenCalledWith(
            'playerError',
            expect.any(Function),
        )
        expect(eventsOnMock).toHaveBeenCalledWith('debug', expect.any(Function))
    })

    it('emits setup top-level handlers when player.on is a function', () => {
        const playerOnMock = jest.fn()
        const player = {
            events: {
                on: jest.fn(),
            },
            on: playerOnMock,
        }

        setupErrorHandlers(player as any)

        expect(playerOnMock).toHaveBeenCalledWith('error', expect.any(Function))
        expect(playerOnMock).toHaveBeenCalledWith('debug', expect.any(Function))
    })

    it('does not emit top-level handlers when player.on is not a function', () => {
        const playerOnMock = jest.fn()
        const player = {
            events: {
                on: jest.fn(),
            },
            on: undefined,
        }

        setupErrorHandlers(player as any)

        expect(playerOnMock).not.toHaveBeenCalled()
    })

    it('handles top-level debug messages without throwing', () => {
        const playerHandlers: Record<
            string,
            TopLevelErrorHandler | TopLevelDebugHandler
        > = {}
        const player = {
            events: {
                on: jest.fn(),
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

        expect(() => {
            ;(playerHandlers.debug as TopLevelDebugHandler)('debug message')
        }).not.toThrow()

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Player runtime debug'),
            }),
        )
    })

    it('handles queue debug messages without throwing', () => {
        const queueHandlers: Record<
            string,
            QueueErrorHandler | PlayerErrorHandler | DebugHandler
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
            on: jest.fn(),
        }

        setupErrorHandlers(player as any)

        const queue = { guild: { name: 'Guild 1' } }

        expect(() => {
            ;(queueHandlers.debug as DebugHandler)(
                queue as any,
                'queue debug message',
            )
        }).not.toThrow()

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Player debug'),
            }),
        )
    })

    it('logs and captures on a stream extraction error', async () => {
        const queueHandlers: Record<
            string,
            QueueErrorHandler | PlayerErrorHandler | DebugHandler
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
            on: jest.fn(),
        }

        setupErrorHandlers(player as any)

        const queue = {
            guild: { id: 'guild-1', name: 'Guild 1' },
            currentTrack: {
                url: 'https://youtube.com/watch?v=123',
                title: 'Test Track',
            },
            node: { skip: jest.fn() },
        }

        // Call the exported async function, not the registered listener: the
        // listener is `(queue, error) => { void handlePlayerErrorSafely(...) }`
        // and returns void, so awaiting it settles nothing. Assertions would
        // then only pass while these calls happen to run before the first
        // internal await.
        await handlePlayerError(
            queue as any,
            new Error('Could not extract stream'),
        )

        expect(captureExceptionMock).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({
                context: 'player-error',
                guildId: 'guild-1',
            }),
        )

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('stream extraction error'),
            }),
        )
    })
})
