import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const apiGet = vi.fn()

vi.mock('@/services/api', () => ({
    default: { get: (url: string) => apiGet(url) },
}))

let isAuthenticated = true
vi.mock('@/stores/authStore', () => ({
    useAuthStore: <T,>(selector: (s: { isAuthenticated: boolean }) => T) =>
        selector({ isAuthenticated }),
}))

import { useVoteStatus } from './useVoteStatus'

beforeEach(() => {
    apiGet.mockReset()
    isAuthenticated = true
})

describe('useVoteStatus', () => {
    test('returns null status while unauthenticated', async () => {
        isAuthenticated = false
        const { result } = renderHook(() => useVoteStatus())
        expect(result.current.status).toBeNull()
        expect(apiGet).not.toHaveBeenCalled()
    })

    test('populates status after successful fetch', async () => {
        apiGet.mockResolvedValue({
            data: {
                hasVoted: true,
                streak: 7,
                nextVoteInSeconds: 3600,
                tier: { label: 'Lucky Fan', threshold: 7 },
                nextTier: { label: 'Lucky Regular', threshold: 14 },
                voteUrl: 'https://top.gg/bot/abc/vote',
            },
        })
        const { result } = renderHook(() => useVoteStatus())
        await waitFor(() => expect(result.current.status).not.toBeNull())
        expect(result.current.status?.tier?.label).toBe('Lucky Fan')
        expect(result.current.status?.streak).toBe(7)
        expect(apiGet).toHaveBeenCalledWith('/me/vote-status')
    })

    test('returns null on fetch error (graceful degrade)', async () => {
        apiGet.mockRejectedValue(new Error('404'))
        const { result } = renderHook(() => useVoteStatus())
        // wait a microtask so the catch handler runs
        await new Promise((r) => setTimeout(r, 10))
        expect(result.current.status).toBeNull()
    })
})
