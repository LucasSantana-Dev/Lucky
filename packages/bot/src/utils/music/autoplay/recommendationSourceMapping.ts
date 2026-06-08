import { RecommendationSource as PrismaRecommendationSource } from '@lucky/shared/types'
import { RecommendationSource } from './recommendationBasis'

/**
 * Maps the bot's internal RecommendationSource union to the Prisma-generated enum.
 *
 * This function bridges the two naming domains:
 * - Bot domain (camelCase-hyphenated): 'spotify-rec', 'lastfm-loved', etc.
 * - Prisma domain (SCREAMING_SNAKE_CASE): RecommendationSource.SPOTIFY_REC, etc.
 *
 * @param src - The bot's recommendation source
 * @returns The corresponding Prisma enum value
 * @throws Compile-time error if a union member is not handled (exhaustiveness check)
 */
export function recommendationSourceToPrisma(
    src: RecommendationSource,
): PrismaRecommendationSource {
    switch (src) {
        case 'spotify-rec':
            return PrismaRecommendationSource.SPOTIFY_REC
        case 'spotify-taste':
            return PrismaRecommendationSource.SPOTIFY_TASTE
        case 'seed-similar':
            return PrismaRecommendationSource.SEED_SIMILAR
        case 'lastfm-loved':
            return PrismaRecommendationSource.LASTFM_LOVED
        case 'lastfm-similar':
            return PrismaRecommendationSource.LASTFM_SIMILAR
        case 'lastfm-genre-fallback':
            return PrismaRecommendationSource.LASTFM_GENRE_FALLBACK
        case 'artist-fallback':
            return PrismaRecommendationSource.ARTIST_FALLBACK
        case 'genre-tag':
            return PrismaRecommendationSource.GENRE_TAG
        default:
            const _exhaustive: never = src
            return _exhaustive
    }
}
