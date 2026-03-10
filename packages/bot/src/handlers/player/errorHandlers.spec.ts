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
    analyzeYouTubeError: (...args: unknown[]) => analyzeYouTubeErrorMock(...args),
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

type PlayerErrorHandler = (queue: any, error: Error) => Promise<void>

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
        const handlers: Record<string, PlayerErrorHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerErrorHandler) => {
                    handlers[event] = handler
                }),
            },
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
            removeTrack: jest.fn(),
            addTrack: jest.fn(),
            node: {
                isPlaying: jest.fn(() => false),
                play: jest.fn().mockResolvedValue(undefined),
                skip: jest.fn(),
            },
        }

        await handlers.playerError(queue as any, new Error('Could not extract stream'))

        expect(recordFailureMock).toHaveBeenCalledWith(
            'youtube',
            expect.any(Number),
            'Could not extract stream',
        )
        expect(queue.player.search).toHaveBeenCalled()
        expect(queue.removeTrack).toHaveBeenCalledWith(0)
        expect(queue.addTrack).toHaveBeenCalledWith(alternativeTrack)
        expect(recordSuccessMock).toHaveBeenCalledWith('youtube')
    })

    it('skips track on parser errors when skip config is enabled', async () => {
        const handlers: Record<string, PlayerErrorHandler> = {}
        const player = {
            events: {
                on: jest.fn((event: string, handler: PlayerErrorHandler) => {
                    handlers[event] = handler
                }),
            },
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

        await handlers.playerError(queue as any, new Error('parser failed'))

        expect(logYouTubeErrorMock).toHaveBeenCalled()
        expect(queue.node.skip).toHaveBeenCalled()
    })
})
