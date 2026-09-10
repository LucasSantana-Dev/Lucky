import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import {
    handleYouTubeParserError,
    recoverFromStreamExtractionError,
} from './streamRecovery'
import { QueryType } from 'discord-player'

const debugLogMock = jest.fn()
const warnLogMock = jest.fn()
const analyzeYouTubeErrorMock = jest.fn()
const logYouTubeErrorMock = jest.fn()
const recordSuccessMock = jest.fn()
const recordFailureMock = jest.fn()
const providerFromTrackMock = jest.fn()
const notifyChannelStreamFailedMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('@lucky/shared/config', () => ({
    youtubeConfig: {
        errorHandling: { skipOnParserError: true },
    },
}))

jest.mock('../../utils/music/youtubeErrorHandler', () => ({
    analyzeYouTubeError: (...args: unknown[]) =>
        analyzeYouTubeErrorMock(...args),
    logYouTubeError: (...args: unknown[]) => logYouTubeErrorMock(...args),
}))

jest.mock('../../utils/music/search/providerHealth', () => ({
    providerFromTrack: (...args: unknown[]) => providerFromTrackMock(...args),
    providerHealthService: {
        recordSuccess: (...args: unknown[]) => recordSuccessMock(...args),
        recordFailure: (...args: unknown[]) => recordFailureMock(...args),
    },
}))

jest.mock('./streamFailureNotifier', () => ({
    notifyChannelStreamFailed: (...args: unknown[]) =>
        notifyChannelStreamFailedMock(...args),
}))

describe('streamRecovery', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        analyzeYouTubeErrorMock.mockReturnValue({
            isParserError: false,
            isCompositeVideoError: false,
            isHypePointsError: false,
            isTypeMismatchError: false,
        })
        providerFromTrackMock.mockReturnValue('youtube')
        notifyChannelStreamFailedMock.mockResolvedValue(undefined)
    })

    describe('handleYouTubeParserError', () => {
        it('logs YouTube error and skips track when config allows', () => {
            const queue = {
                guild: { name: 'Guild 1' },
                currentTrack: {
                    requestedBy: { id: 'user-1' },
                },
                node: { skip: jest.fn() },
            }
            const error = new Error('parser failed')
            const youtubeErrorInfo = {
                isParserError: true,
                isCompositeVideoError: false,
                isHypePointsError: false,
                isTypeMismatchError: true,
            }

            handleYouTubeParserError(queue as any, error, youtubeErrorInfo)

            expect(logYouTubeErrorMock).toHaveBeenCalledWith(
                error,
                expect.stringContaining('Guild 1'),
                'user-1',
            )
            expect(queue.node.skip).toHaveBeenCalled()
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('parser error'),
                    data: expect.objectContaining({
                        errorType: 'TypeMismatch',
                    }),
                }),
            )
        })

        it('identifies error types correctly', () => {
            const queue = {
                guild: { name: 'Guild 1' },
                currentTrack: { requestedBy: { id: 'user-1' } },
                node: { skip: jest.fn() },
            }
            const error = new Error('composite error')

            analyzeYouTubeErrorMock.mockReturnValue({
                isParserError: true,
                isCompositeVideoError: true,
                isHypePointsError: false,
                isTypeMismatchError: false,
            })

            handleYouTubeParserError(
                queue as any,
                error,
                analyzeYouTubeErrorMock(),
            )

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        errorType: 'CompositeVideoPrimaryInfo',
                    }),
                }),
            )
        })
    })

    describe('recoverFromStreamExtractionError', () => {
        it('recovers stream extraction and inserts alternative track', async () => {
            const alternativeTrack = { url: 'https://example.com/alt' }
            const queue = {
                guild: { id: 'guild-1', name: 'Guild 1' },
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
                node: { skip: jest.fn() },
            }

            await recoverFromStreamExtractionError(
                queue as any,
                queue.currentTrack as any,
            )

            expect(queue.player.search).toHaveBeenCalledWith('Song A', {
                requestedBy: { id: 'user-1' },
                searchEngine: QueryType.YOUTUBE_SEARCH,
            })
            expect(queue.insertTrack).toHaveBeenCalledWith(alternativeTrack, 0)
            expect(queue.node.skip).toHaveBeenCalled()
            expect(recordSuccessMock).toHaveBeenCalledWith('youtube')
        })

        it('skips when no requester is available', async () => {
            const queue = {
                guild: { id: 'guild-1', name: 'Guild 1' },
                metadata: {},
                currentTrack: {
                    url: 'https://example.com/current',
                    title: 'Song A',
                },
                player: { search: jest.fn() },
                node: { skip: jest.fn() },
            }

            await recoverFromStreamExtractionError(
                queue as any,
                queue.currentTrack as any,
            )

            expect(queue.player.search).not.toHaveBeenCalled()
            expect(notifyChannelStreamFailedMock).toHaveBeenCalledWith(
                queue,
                'Song A',
            )
            expect(queue.node.skip).toHaveBeenCalled()
        })

        it('skips when currentTrack has no title', async () => {
            const queue = {
                guild: { id: 'guild-1', name: 'Guild 1' },
                metadata: { requestedBy: { id: 'user-1' } },
                currentTrack: {
                    url: 'https://example.com/current',
                    title: '',
                    requestedBy: { id: 'user-1' },
                },
                player: { search: jest.fn() },
                node: { skip: jest.fn() },
            }

            await recoverFromStreamExtractionError(
                queue as any,
                queue.currentTrack as any,
            )

            expect(queue.player.search).not.toHaveBeenCalled()
            expect(notifyChannelStreamFailedMock).toHaveBeenCalledWith(
                queue,
                '',
            )
            expect(queue.node.skip).toHaveBeenCalled()
        })

        it('skips when YouTube search returns no results', async () => {
            const queue = {
                guild: { id: 'guild-1', name: 'Guild 1' },
                metadata: { requestedBy: { id: 'user-1' } },
                currentTrack: {
                    url: 'https://example.com/current',
                    title: 'Song A',
                    requestedBy: { id: 'user-1' },
                },
                player: {
                    search: jest.fn().mockResolvedValue({ tracks: [] }),
                },
                insertTrack: jest.fn(),
                node: { skip: jest.fn() },
            }

            await recoverFromStreamExtractionError(
                queue as any,
                queue.currentTrack as any,
            )

            expect(queue.insertTrack).not.toHaveBeenCalled()
            expect(notifyChannelStreamFailedMock).toHaveBeenCalledWith(
                queue,
                'Song A',
            )
            expect(queue.node.skip).toHaveBeenCalled()
        })

        it('skips when search times out (returns null)', async () => {
            const queue = {
                guild: { id: 'guild-1', name: 'Guild 1' },
                metadata: { requestedBy: { id: 'user-1' } },
                currentTrack: {
                    url: 'https://example.com/current',
                    title: 'Slow Song',
                    requestedBy: { id: 'user-1' },
                },
                player: { search: jest.fn().mockResolvedValue(null) },
                insertTrack: jest.fn(),
                node: { skip: jest.fn() },
            }

            await recoverFromStreamExtractionError(
                queue as any,
                queue.currentTrack as any,
            )

            expect(queue.insertTrack).not.toHaveBeenCalled()
            expect(notifyChannelStreamFailedMock).toHaveBeenCalled()
            expect(queue.node.skip).toHaveBeenCalled()
        })

        it('skips without reinserting when all alternatives have same URL', async () => {
            const queue = {
                guild: { id: 'guild-1', name: 'Guild 1' },
                metadata: { requestedBy: { id: 'user-1' } },
                currentTrack: {
                    url: 'https://www.youtube.com/watch?v=abc123',
                    title: 'Song A',
                    requestedBy: { id: 'user-1' },
                },
                player: {
                    search: jest.fn().mockResolvedValue({
                        tracks: [
                            {
                                url: 'https://www.youtube.com/watch?v=abc123',
                                title: 'Song A',
                            },
                        ],
                    }),
                },
                insertTrack: jest.fn(),
                node: { skip: jest.fn() },
            }

            await recoverFromStreamExtractionError(
                queue as any,
                queue.currentTrack as any,
            )

            expect(queue.insertTrack).not.toHaveBeenCalled()
            expect(queue.node.skip).toHaveBeenCalled()
            expect(warnLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('same track alternative'),
                }),
            )
        })
    })
})
