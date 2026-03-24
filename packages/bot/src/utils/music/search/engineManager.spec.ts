import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { QueryType } from 'discord-player'
import { SearchEngineManager } from './engineManager'

const debugLogMock = jest.fn()
const createYouTubeErrorMessageMock = jest.fn()
const logYouTubeErrorMock = jest.fn()
const isAvailableMock = jest.fn()
const recordSuccessMock = jest.fn()
const recordFailureMock = jest.fn()
const providerFromQueryTypeMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('../youtubeErrorHandler', () => ({
    createYouTubeErrorMessage: (...args: unknown[]) =>
        createYouTubeErrorMessageMock(...args),
    logYouTubeError: (...args: unknown[]) => logYouTubeErrorMock(...args),
}))

const getOrderedProvidersMock = jest.fn()

jest.mock('./providerHealth', () => ({
    providerHealthService: {
        isAvailable: (...args: unknown[]) => isAvailableMock(...args),
        recordSuccess: (...args: unknown[]) => recordSuccessMock(...args),
        recordFailure: (...args: unknown[]) => recordFailureMock(...args),
        getOrderedProviders: (...args: unknown[]) =>
            getOrderedProvidersMock(...args),
    },
    providerFromQueryType: (...args: unknown[]) =>
        providerFromQueryTypeMock(...args),
}))

describe('SearchEngineManager', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isAvailableMock.mockReturnValue(true)
        getOrderedProvidersMock.mockImplementation((providers: string[]) => providers)
        providerFromQueryTypeMock.mockImplementation((engine: QueryType) => {
            if (engine === QueryType.YOUTUBE_SEARCH) return 'youtube'
            if (engine === QueryType.AUTO) return 'youtube'
            return 'spotify'
        })
        createYouTubeErrorMessageMock.mockReturnValue('formatted error')
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('returns successful result on first attempt', async () => {
        const player = {
            search: jest.fn().mockResolvedValue({ tracks: [{ title: 'A' }] }),
        }
        const manager = new SearchEngineManager(player as any)

        const result = await manager.performSearch({
            query: 'song',
            requestedBy: { id: 'user-1' } as any,
            preferredEngine: QueryType.YOUTUBE_SEARCH,
            enableFallbacks: false,
        })

        expect(result).toEqual({
            success: true,
            result: { tracks: [{ title: 'A' }] },
            usedFallback: false,
            attempts: 1,
        })
        expect(recordSuccessMock).toHaveBeenCalledWith('youtube')
    })

    it('falls back to secondary providers when enabled', async () => {
        const player = {
            search: jest
                .fn()
                .mockResolvedValueOnce({ tracks: [] })
                .mockResolvedValueOnce({ tracks: [{ title: 'B' }] }),
        }
        const manager = new SearchEngineManager(player as any)

        const result = await manager.performSearch({
            query: 'fallback song',
            requestedBy: { id: 'user-1' } as any,
            preferredEngine: QueryType.YOUTUBE_SEARCH,
            enableFallbacks: true,
        })

        expect(result.success).toBe(true)
        expect(result.usedFallback).toBe(true)
        expect(result.attempts).toBe(2)
        expect(recordFailureMock).toHaveBeenCalledWith(
            'youtube',
            expect.any(Number),
            'No tracks found',
        )
    })

    it('formats search errors when all attempts fail', async () => {
        const player = {
            search: jest.fn().mockRejectedValue(new Error('extractor failed')),
        }
        const manager = new SearchEngineManager(player as any)

        const result = await manager.performSearch({
            query: 'broken',
            requestedBy: { id: 'user-1' } as any,
            preferredEngine: QueryType.YOUTUBE_SEARCH,
            enableFallbacks: false,
        })

        expect(logYouTubeErrorMock).toHaveBeenCalled()
        expect(recordFailureMock).toHaveBeenCalled()
        expect(result).toEqual({
            success: false,
            error: 'formatted error',
            attempts: 1,
        })
    })

    it('retries and succeeds on a later attempt', async () => {
        jest.useFakeTimers()
        const player = {
            search: jest.fn(),
        }
        const manager = new SearchEngineManager(player as any)
        const performSearchSpy = jest
            .spyOn(manager, 'performSearch')
            .mockResolvedValueOnce({
                success: false,
                error: 'first failure',
                attempts: 1,
            })
            .mockResolvedValueOnce({
                success: true,
                result: { tracks: [{ title: 'C' }] } as any,
                attempts: 1,
            })

        const searchPromise = manager.performRetrySearch({
            query: 'retry song',
            requestedBy: { id: 'user-1' } as any,
            maxRetries: 2,
            enableFallbacks: true,
        })
        await jest.advanceTimersByTimeAsync(1000)
        const result = await searchPromise

        expect(performSearchSpy).toHaveBeenCalledTimes(2)
        expect(debugLogMock).toHaveBeenCalled()
        expect(result).toEqual({
            success: true,
            result: { tracks: [{ title: 'C' }] },
            attempts: 2,
        })
    })

    it('sorts fallback providers by health score via getOrderedProviders', async () => {
        // spotify degraded so getOrderedProviders puts soundcloud first
        getOrderedProvidersMock.mockReturnValue(['soundcloud', 'spotify'])
        const player = {
            search: jest
                .fn()
                .mockResolvedValueOnce({ tracks: [] }) // youtube (preferred) fails
                .mockResolvedValueOnce({ tracks: [{ title: 'SC track' }] }), // soundcloud succeeds
        }
        const manager = new SearchEngineManager(player as any)

        const result = await manager.performSearch({
            query: 'degraded fallback test',
            requestedBy: { id: 'user-1' } as any,
            preferredEngine: QueryType.YOUTUBE_SEARCH,
            enableFallbacks: true,
        })

        expect(getOrderedProvidersMock).toHaveBeenCalled()
        expect(result.success).toBe(true)
        expect(result.usedFallback).toBe(true)
        expect(result.attempts).toBe(2)
    })

    it('skips on-cooldown fallback providers and uses remaining healthy ones', async () => {
        // getOrderedProviders returns only soundcloud (spotify on cooldown)
        getOrderedProvidersMock.mockReturnValue(['soundcloud'])
        const player = {
            search: jest
                .fn()
                .mockResolvedValueOnce({ tracks: [] }) // youtube fails
                .mockResolvedValueOnce({ tracks: [{ title: 'SC' }] }), // soundcloud ok
        }
        const manager = new SearchEngineManager(player as any)

        const result = await manager.performSearch({
            query: 'cooldown skip test',
            requestedBy: { id: 'user-1' } as any,
            preferredEngine: QueryType.YOUTUBE_SEARCH,
            enableFallbacks: true,
        })

        expect(result.success).toBe(true)
        expect(result.attempts).toBe(2)
    })

    it('returns failure details after max retry exhaustion', async () => {
        const player = { search: jest.fn() }
        const manager = new SearchEngineManager(player as any)
        jest.spyOn(manager, 'performSearch').mockResolvedValue({
            success: false,
            error: 'search failed',
            attempts: 1,
        })

        const result = await manager.performRetrySearch({
            query: 'never found',
            requestedBy: { id: 'user-1' } as any,
            maxRetries: 1,
            enableFallbacks: true,
        })

        expect(result).toEqual({
            success: false,
            error: 'search failed',
            attempts: 1,
        })
    })

    it('still tries preferred engine for direct provider queries even during cooldown', async () => {
        isAvailableMock.mockReturnValue(false)
        const player = {
            search: jest.fn().mockResolvedValue({ tracks: [{ title: 'Direct URL' }] }),
        }
        const manager = new SearchEngineManager(player as any)

        const result = await manager.performSearch({
            query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            requestedBy: { id: 'user-1' } as any,
            preferredEngine: QueryType.YOUTUBE_VIDEO,
            enableFallbacks: false,
        })

        expect(player.search).toHaveBeenCalledTimes(1)
        expect(player.search).toHaveBeenCalledWith(
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            expect.objectContaining({ searchEngine: QueryType.YOUTUBE_VIDEO }),
        )
        expect(result.success).toBe(true)
    })
})
