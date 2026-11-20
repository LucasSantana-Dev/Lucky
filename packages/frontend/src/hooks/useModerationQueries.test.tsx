import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useModerationCases, useModerationStats } from './useModerationQueries'
import { api } from '@/services/api'

vi.mock('@/services/api')

describe('useModerationQueries', () => {
    let queryClient: QueryClient

    beforeEach(() => {
        vi.clearAllMocks()
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        })
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )

    describe('useModerationStats', () => {
        test('unwraps response.data.stats when the call succeeds', async () => {
            const stats = { totalCases: 4, activeCases: 1 }
            vi.mocked(api.moderation.getStats).mockResolvedValue({
                data: { stats },
            } as never)

            const { result } = renderHook(() => useModerationStats('g1'), {
                wrapper,
            })

            await waitFor(() => expect(result.current.isSuccess).toBe(true))
            expect(result.current.data).toEqual(stats)
            expect(api.moderation.getStats).toHaveBeenCalledWith('g1')
        })

        test('does not fetch when guild id is undefined', () => {
            const { result } = renderHook(() => useModerationStats(undefined), {
                wrapper,
            })

            expect(result.current.fetchStatus).toBe('idle')
            expect(api.moderation.getStats).not.toHaveBeenCalled()
        })

        test('surfaces the error when the API call rejects', async () => {
            vi.mocked(api.moderation.getStats).mockRejectedValue(
                new Error('boom'),
            )

            const { result } = renderHook(() => useModerationStats('g1'), {
                wrapper,
            })

            await waitFor(() => expect(result.current.isError).toBe(true))
            expect(result.current.error?.message).toBe('boom')
        })
    })

    describe('useModerationCases', () => {
        test('returns response.data and forwards guild id and filters', async () => {
            const data = { cases: [{ id: '1' }], total: 1 }
            const filters = { type: 'ban', page: 2 }
            vi.mocked(api.moderation.getCases).mockResolvedValue({
                data,
            } as never)

            const { result } = renderHook(
                () => useModerationCases('g1', filters as never),
                { wrapper },
            )

            await waitFor(() => expect(result.current.isSuccess).toBe(true))
            expect(result.current.data).toEqual(data)
            expect(api.moderation.getCases).toHaveBeenCalledWith('g1', filters)
        })

        test('does not fetch when guild id is undefined', () => {
            const { result } = renderHook(() => useModerationCases(undefined), {
                wrapper,
            })

            expect(result.current.fetchStatus).toBe('idle')
            expect(api.moderation.getCases).not.toHaveBeenCalled()
        })

        test('refetches when filters change because they are part of the query key', async () => {
            vi.mocked(api.moderation.getCases).mockResolvedValue({
                data: { cases: [], total: 0 },
            } as never)

            const { result, rerender } = renderHook(
                ({ filters }: { filters: { type: string } }) =>
                    useModerationCases('g1', filters as never),
                { wrapper, initialProps: { filters: { type: 'ban' } } },
            )
            await waitFor(() => expect(result.current.isSuccess).toBe(true))

            rerender({ filters: { type: 'kick' } })

            await waitFor(() =>
                expect(api.moderation.getCases).toHaveBeenCalledTimes(2),
            )
            expect(api.moderation.getCases).toHaveBeenLastCalledWith('g1', {
                type: 'kick',
            })
        })
    })
})
