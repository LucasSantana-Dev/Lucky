import { useEffect, useState } from 'react'
import { api, type VoteStatus } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

export type { VoteStatus }

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
        api.me
            .getVoteStatus()
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
