import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const getVoteStatus = vi.fn()

vi.mock('@/services/api', () => ({
    api: { me: { getVoteStatus: () => getVoteStatus() } },
}))

let isAuthenticated = true
vi.mock('@/stores/authStore', () => ({
    useAuthStore: <T>(selector: (s: { isAuthenticated: boolean }) => T) =>
        selector({ isAuthenticated }),
}))

import { useVoteStatus } from './useVoteStatus'

beforeEach(() => {
    getVoteStatus.mockReset()
    isAuthenticated = true
})

describe('useVoteStatus', () => {
    test('returns null status while unauthenticated', async () => {
        isAuthenticated = false
        const { result } = renderHook(() => useVoteStatus())
        expect(result.current.status).toBeNull()
        expect(getVoteStatus).not.toHaveBeenCalled()
    })

    test('populates status after successful fetch', async () => {
        getVoteStatus.mockResolvedValue({
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
        expect(getVoteStatus).toHaveBeenCalled()
    })

    test('returns null on fetch error (graceful degrade)', async () => {
        getVoteStatus.mockRejectedValue(new Error('404'))
        const { result } = renderHook(() => useVoteStatus())
        // wait a microtask so the catch handler runs
        await new Promise((r) => setTimeout(r, 10))
        expect(result.current.status).toBeNull()
    })
})
