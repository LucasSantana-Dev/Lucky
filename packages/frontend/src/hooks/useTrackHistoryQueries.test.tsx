import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useRecentTracks } from './useTrackHistoryQueries'
import { api } from '@/services/api'

vi.mock('@/services/api')

describe('useRecentTracks', () => {
    let queryClient: QueryClient

    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
            },
        })
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    test('returns data when guild ID is provided and API call succeeds', async () => {
        const mockHistoryData = [
            {
                trackId: '1',
                title: 'Song 1',
                author: 'Artist 1',
                duration: '3:30',
                url: 'https://example.com/1',
                timestamp: Date.now(),
            },
        ]

        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: mockHistoryData },
        } as any)

        const { result } = renderHook(
            () => useRecentTracks('guild-123', 5),
            { wrapper },
        )

        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true)
        })

        expect(result.current.data).toEqual(mockHistoryData)
        expect(api.trackHistory.getHistory).toHaveBeenCalledWith('guild-123', 5)
    })

    test('uses default limit when not provided', async () => {
        vi.mocked(api.trackHistory.getHistory).mockResolvedValue({
            data: { history: [] },
        } as any)

        renderHook(() => useRecentTracks('guild-456'), { wrapper })

        await waitFor(() => {
            expect(api.trackHistory.getHistory).toHaveBeenCalledWith(
                'guild-456',
                5,
            )
        })
    })

    test('is disabled when guild ID is undefined', async () => {
        const { result } = renderHook(() => useRecentTracks(undefined, 5), {
            wrapper,
        })

        expect(result.current.isLoading).toBe(false)
        expect(api.trackHistory.getHistory).not.toHaveBeenCalled()
    })

    test('propagates error when API call fails', async () => {
        const mockError = new Error('Network error')
        vi.mocked(api.trackHistory.getHistory).mockRejectedValue(mockError)

        const { result } = renderHook(
            () => useRecentTracks('guild-789', 5),
            { wrapper },
        )

        await waitFor(() => {
            expect(result.current.isError).toBe(true)
        })

        expect(result.current.error).toBeDefined()
    })
})
