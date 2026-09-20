import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { isExtractorDegraded } from '../../../../../handlers/player/extractorHealth'
import { detectQueryType } from '../queryDetector'

export function resolvePlayErrorMessage(
    error: unknown,
    query?: string,
): string {
    const isNoResultsError =
        error instanceof Error && /no results found/i.test(error.message)

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
