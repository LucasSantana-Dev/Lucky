export type CollaborativePlaylistState = {
    enabled: boolean
    perUserLimit: number
    contributions: Record<string, number>
    updatedAt: number
}

const DEFAULT_LIMIT = 3

class CollaborativePlaylistService {
    private readonly states = new Map<string, CollaborativePlaylistState>()

    private ensure(guildId: string): CollaborativePlaylistState {
        const existing = this.states.get(guildId)
        if (existing) return existing
        const created: CollaborativePlaylistState = {
            enabled: false,
            perUserLimit: DEFAULT_LIMIT,
            contributions: {},
            updatedAt: Date.now(),
        }
        this.states.set(guildId, created)
        return created
    }

    setMode(
        guildId: string,
        enabled: boolean,
        perUserLimit?: number,
    ): CollaborativePlaylistState {
        const state = this.ensure(guildId)
        state.enabled = enabled
        if (
            typeof perUserLimit === 'number' &&
            Number.isFinite(perUserLimit) &&
            perUserLimit > 0
        ) {
            state.perUserLimit = Math.floor(perUserLimit)
        }
        state.updatedAt = Date.now()
        return this.getState(guildId)
    }

    getState(guildId: string): CollaborativePlaylistState {
        const state = this.ensure(guildId)
        return {
            ...state,
            contributions: { ...state.contributions },
        }
    }

    resetContributions(guildId: string): CollaborativePlaylistState {
        const state = this.ensure(guildId)
        state.contributions = {}
        state.updatedAt = Date.now()
        return this.getState(guildId)
    }

    canAddTracks(
        guildId: string,
        userId: string,
        trackCount = 1,
    ): { allowed: boolean; used: number; remaining: number; limit: number } {
        const state = this.ensure(guildId)
        const used = state.contributions[userId] ?? 0
        const next = used + Math.max(1, trackCount)
        const limit = state.perUserLimit

        if (!state.enabled) {
            return {
                allowed: true,
                used,
                remaining: Number.POSITIVE_INFINITY,
                limit,
            }
        }

        const remaining = Math.max(0, limit - used)
        return {
            allowed: next <= limit,
            used,
            remaining,
            limit,
        }
    }

    recordContribution(guildId: string, userId: string, trackCount = 1): void {
        const state = this.ensure(guildId)
        if (!state.enabled) return

        const increment = Math.max(1, trackCount)
        state.contributions[userId] =
            (state.contributions[userId] ?? 0) + increment
        state.updatedAt = Date.now()
    }
}

export const collaborativePlaylistService = new CollaborativePlaylistService()
