import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { isExtractorDegraded } from '../../../../../handlers/player/extractorHealth'

// "No results found" is misleading when it's actually a degraded extractor
// (e.g. YouTube session init silently failed but registration still
// reported success) — say so instead (#1929).
export function resolvePlayErrorMessage(error: unknown): string {
    const isNoResultsError =
        error instanceof Error && /no results found/i.test(error.message)
    if (isNoResultsError && isExtractorDegraded('youtube')) {
        return 'Music sources are currently unreachable. Please try again in a few minutes.'
    }
    return createUserFriendlyError(error)
}
