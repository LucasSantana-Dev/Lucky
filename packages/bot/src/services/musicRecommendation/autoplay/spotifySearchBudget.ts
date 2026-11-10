import type { SpotifySearchBudget } from './autoplayContext'
import { isSpotifyBlocked } from '../../../handlers/player/spotifyApiFailureLog'

// Spotify text searches one replenish pass may spend. A replenish can fan out
// to ~20 searches and each one counts against a development-mode quota that
// a single 429 can lock for hours (#2971, #2972). Kept out of lastFmSeeder so
// candidateCollector can claim from it without an import cycle.
export const MAX_SPOTIFY_SEARCHES_PER_REPLENISH = 5

export function spotifySearchBudgetFor(ctx: {
    spotifySearchBudget?: SpotifySearchBudget
}): SpotifySearchBudget {
    ctx.spotifySearchBudget ??= {
        remaining: MAX_SPOTIFY_SEARCHES_PER_REPLENISH,
    }
    return ctx.spotifySearchBudget
}

/**
 * True, and spends one search from the budget, when a Spotify text search is
 * allowed: Spotify is not 429-blocked and the budget (when given) is left.
 */
export function claimSpotifySearch(budget?: SpotifySearchBudget): boolean {
    if (isSpotifyBlocked()) return false
    if (!budget) return true
    if (budget.remaining <= 0) return false
    budget.remaining -= 1
    return true
}
