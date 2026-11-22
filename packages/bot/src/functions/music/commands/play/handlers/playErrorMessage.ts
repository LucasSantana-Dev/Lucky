import { errorLog, warnLog } from '@lucky/shared/utils'
import { createUserFriendlyError } from '@lucky/shared/utils/general/errorSanitizer'
import { isExtractorDegraded } from '../../../../../handlers/player/extractorHealth'
import {
    classifyOutcome,
    type ClassifiedOutcome,
} from '../../../../../utils/monitoring/commandOutcome'
import { detectQueryType } from '../queryDetector'
import {
    YoutubePlaylistUnavailableError,
    YoutubeVideoUnavailableError,
} from './youtubeLinkErrors'
import { AsmrBlockedError } from '../../../../../utils/music/asmrFilter'

type Translate = (key: string) => string

// A link no real extractor recognizes (a Spotify artist page, Deezer,
// TikTok...) is claimed by AttachmentExtractor, which accepts any URL and then
// finds nothing. "No results" plus its extractor id hides the real problem:
// this kind of link is not supported.
function isUnsupportedLinkFailure(
    isNoResultsError: boolean,
    error: unknown,
    query: string | undefined,
): boolean {
    return (
        isNoResultsError &&
        query !== undefined &&
        /^https?:\/\//i.test(query.trim()) &&
        /\(Extractor: com\.discord-player\.attachmentextractor\)\s*$/i.test(
            (error as Error).message,
        )
    )
}

// "No results found" is misleading when it's actually a degraded extractor
// (e.g. YouTube session init silently failed but registration still
// reported success) — say so instead (#1929).
//
// Scoped to queries only the degraded extractor could have served (#2000).
// A text search falls through resolveQueryWithFallbacks to Spotify and
// SoundCloud, so if it still finds nothing, the healthy engines answered and
// genuinely found nothing — calling that "unreachable" told users an outage
// had happened when the fallbacks had worked correctly.
//
// YouTube link failures the title fallback could not rescue get their own
// translated message when the caller passes a translator (`t`).
export function resolvePlayErrorMessage(
    error: unknown,
    query?: string,
    t?: Translate,
): string {
    if (error instanceof YoutubePlaylistUnavailableError) {
        return t
            ? t('music.errors.youtubePlaylistUnavailable')
            : "YouTube playlists aren't available right now. Paste the link of a single song, or just type its name."
    }
    if (error instanceof YoutubeVideoUnavailableError) {
        return t
            ? t('music.errors.youtubeVideoUnavailable')
            : "Couldn't play this YouTube link right now. Try typing the song and artist name instead."
    }
    if (error instanceof AsmrBlockedError) {
        return t ? t('music.errors.asmrBlocked') : error.message
    }

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
    if (isUnsupportedLinkFailure(isNoResultsError, error, query)) {
        return t
            ? t('music.errors.unsupportedLink')
            : "That link isn't supported. Lucky plays Spotify tracks, albums and playlists, SoundCloud, Apple Music and Vimeo links, or direct audio files. You can also type the song name."
    }

    return createUserFriendlyError(error)
}

/**
 * Outcome recorded in command_events for a /play that failed after the
 * handler replied: "nothing found" is the user's query (user_error), anything
 * else is the bot's (error).
 */
export function classifyPlayFailure(error: unknown): ClassifiedOutcome {
    const classified = classifyOutcome({ error })
    const isNoResults =
        error instanceof Error && /no results found/i.test(error.message)
    return isNoResults || error instanceof AsmrBlockedError
        ? { ...classified, outcome: 'user_error' }
        : classified
}

/**
 * "Nothing found" is the user's query, not a bot fault: log it as a warning
 * and leave the query text out (it would become the Sentry issue title and
 * split every distinct search into its own group). Anything else is an error.
 */
export function logPlayFailure(
    message: string,
    error: unknown,
    data: { query?: string; guildId: string | null },
): void {
    // A no-results failure on a link only YouTube could serve while the
    // extractor is degraded is an outage, not the user's query: keep it on
    // the error path so Sentry and the error-rate alert still see it.
    const degradedYoutubeOutage =
        error instanceof Error &&
        !(error instanceof AsmrBlockedError) &&
        data.query !== undefined &&
        detectQueryType(data.query) === 'youtube' &&
        isExtractorDegraded('youtube')
    if (
        !degradedYoutubeOutage &&
        classifyPlayFailure(error).outcome === 'user_error'
    ) {
        warnLog({
            message:
                error instanceof AsmrBlockedError
                    ? `${message} ASMR blocked (expected)`
                    : `${message} no results (expected)`,
            data: { guildId: data.guildId },
        })
        return
    }
    errorLog({ message, error, data })
}
