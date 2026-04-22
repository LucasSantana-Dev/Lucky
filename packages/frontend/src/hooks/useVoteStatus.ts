import { useEffect, useState } from 'react'
import { API_ROUTES } from '@lucky/shared/constants'
import apiClient from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

export interface VoteStatus {
    hasVoted: boolean
    streak: number
    nextVoteInSeconds: number
    tier: { label: string; threshold: number } | null
    nextTier: { label: string; threshold: number } | null
    voteUrl: string
}

/**
 * Reads the authenticated user's top.gg vote streak + tier from the backend.
 * Returns null status while loading, while unauthenticated, or if the endpoint
 * 404s (e.g. before the backend PR has deployed). Callers should gracefully
 * hide UI in that case rather than show an error.
 */
export function useVoteStatus() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const [status, setStatus] = useState<VoteStatus | null>(null)

    useEffect(() => {
        if (!isAuthenticated) {
            setStatus(null)
            return
        }
        let cancelled = false
        apiClient
            .get<VoteStatus>(API_ROUTES.ME.voteStatus())
            .then((resp) => {
                if (!cancelled) setStatus(resp.data)
            })
            .catch(() => {
                // Silent degrade — the badge simply won't render.
                if (!cancelled) setStatus(null)
            })
        return () => {
            cancelled = true
        }
    }, [isAuthenticated])

    return { status }
}
