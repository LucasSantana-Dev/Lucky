import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { isExtractorDegraded } from '../../../../../handlers/player/extractorHealth'
import { detectQueryType } from '../queryDetector'

// "No results found" is misleading when it's actually a degraded extractor
// (e.g. YouTube session init silently failed but registration still
// reported success) — say so instead (#1929).
//
// Scoped to queries only the degraded extractor could have served (#2000).
// A text search falls through resolveQueryWithFallbacks to Spotify and
// SoundCloud, so if it still finds nothing, the healthy engines answered and
// genuinely found nothing — calling that "unreachable" told users an outage
// had happened when the fallbacks had worked correctly.
export function resolvePlayErrorMessage(
    error: unknown,
    query?: string,
): string {
    const isNoResultsError =
        error instanceof Error && /no results found/i.test(error.message)

    // Without a query we cannot tell the two cases apart, so fall back to the
    // accurate generic message rather than guessing "outage".
    const onlyYoutubeCouldServe =
        query !== undefined && detectQueryType(query) === 'youtube'

    if (
        isNoResultsError &&
        onlyYoutubeCouldServe &&
        isExtractorDegraded('youtube')
    ) {
        return 'Music sources are currently unreachable. Please try again in a few minutes.'
    }
    return createUserFriendlyError(error)
}
