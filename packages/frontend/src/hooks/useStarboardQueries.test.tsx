import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useStarboardTop } from './useStarboardQueries'
import { api } from '@/services/api'

vi.mock('@/services/api')

describe('useStarboardTop', () => {
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

    test('returns top starboard entries when guild ID is provided and API call succeeds', async () => {
        const mockEntriesData = [
            {
                id: '1',
                messageId: 'msg-1',
                authorId: 'user-1',
                authorName: 'User 1',
                content: 'Great message',
                stars: 10,
                timestamp: Date.now(),
            },
            {
                id: '2',
                messageId: 'msg-2',
                authorId: 'user-2',
                authorName: 'User 2',
                content: 'Another great message',
                stars: 8,
                timestamp: Date.now(),
            },
        ]

        vi.mocked(api.starboard.getTopEntries).mockResolvedValue(
            mockEntriesData as any,
        )

        const { result } = renderHook(
            () => useStarboardTop('guild-123', 3),
            { wrapper },
        )

        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true)
        })

        expect(result.current.data).toEqual(mockEntriesData)
        expect(api.starboard.getTopEntries).toHaveBeenCalledWith('guild-123', 3)
    })

    test('uses default limit when not provided', async () => {
        vi.mocked(api.starboard.getTopEntries).mockResolvedValue([] as any)

        renderHook(() => useStarboardTop('guild-456'), { wrapper })

        await waitFor(() => {
            expect(api.starboard.getTopEntries).toHaveBeenCalledWith(
                'guild-456',
                3,
            )
        })
    })

    test('is disabled when guild ID is undefined', async () => {
        const { result } = renderHook(() => useStarboardTop(undefined, 3), {
            wrapper,
        })

        expect(result.current.isLoading).toBe(false)
        expect(api.starboard.getTopEntries).not.toHaveBeenCalled()
    })

    test('propagates error when API call fails', async () => {
        const mockError = new Error('Failed to fetch starboard entries')
        vi.mocked(api.starboard.getTopEntries).mockRejectedValue(mockError)

        const { result } = renderHook(
            () => useStarboardTop('guild-789', 3),
            { wrapper },
        )

        await waitFor(() => {
            expect(result.current.isError).toBe(true)
        })

        expect(result.current.error).toBeDefined()
    })
})
