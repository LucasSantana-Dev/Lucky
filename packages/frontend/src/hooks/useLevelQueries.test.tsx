import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useLevelLeaderboard } from './useLevelQueries'
import { api } from '@/services/api'

vi.mock('@/services/api')

describe('useLevelLeaderboard', () => {
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

    test('returns leaderboard data when guild ID is provided and API call succeeds', async () => {
        const mockLeaderboardData = [
            { userId: '1', username: 'User 1', level: 10, xp: 5000 },
            { userId: '2', username: 'User 2', level: 9, xp: 4500 },
        ]

        vi.mocked(api.levels.getLeaderboard).mockResolvedValue(
            mockLeaderboardData as any,
        )

        const { result } = renderHook(
            () => useLevelLeaderboard('guild-123', 5),
            { wrapper },
        )

        await waitFor(() => {
            expect(result.current.isSuccess).toBe(true)
        })

        expect(result.current.data).toEqual(mockLeaderboardData)
        expect(api.levels.getLeaderboard).toHaveBeenCalledWith('guild-123', 5)
    })

    test('uses default limit when not provided', async () => {
        vi.mocked(api.levels.getLeaderboard).mockResolvedValue([] as any)

        renderHook(() => useLevelLeaderboard('guild-456'), { wrapper })

        await waitFor(() => {
            expect(api.levels.getLeaderboard).toHaveBeenCalledWith('guild-456', 5)
        })
    })

    test('is disabled when guild ID is undefined', async () => {
        const { result } = renderHook(() => useLevelLeaderboard(undefined, 5), {
            wrapper,
        })

        expect(result.current.isLoading).toBe(false)
        expect(api.levels.getLeaderboard).not.toHaveBeenCalled()
    })

    test('propagates error when API call fails', async () => {
        const mockError = new Error('Failed to fetch leaderboard')
        vi.mocked(api.levels.getLeaderboard).mockRejectedValue(mockError)

        const { result } = renderHook(
            () => useLevelLeaderboard('guild-789', 5),
            { wrapper },
        )

        await waitFor(() => {
            expect(result.current.isError).toBe(true)
        })

        expect(result.current.error).toBeDefined()
    })
})
