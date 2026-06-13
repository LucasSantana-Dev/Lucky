/**
 * Bidirectional mapping between emoji characters and skip reasons.
 * Used by the now-playing message reactions and the skip-reason reaction handler.
 */

export type SkipReason = 'generic_dislike' | 'too_chill' | 'mood_mismatch' | 'repeat'

export const SKIP_REASON_EMOJI_MAP: Record<string, SkipReason> = {
    '👎': 'generic_dislike',
    '😴': 'too_chill',
    '🎸': 'mood_mismatch',
    '🔁': 'repeat',
}

/**
 * Get the list of emoji characters for skip reasons (used for adding reactions).
 */
export function getSkipReasonEmojis(): string[] {
    return Object.keys(SKIP_REASON_EMOJI_MAP)
}
