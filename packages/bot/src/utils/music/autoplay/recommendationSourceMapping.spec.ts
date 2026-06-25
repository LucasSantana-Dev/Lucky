import { describe, expect, it } from '@jest/globals'
import { recommendationSourceToPrisma } from './recommendationSourceMapping'
import { RecommendationSource as PrismaRecommendationSource } from '@lucky/shared/types'

describe('recommendationSourceToPrisma', () => {
	it.each<[string, string]>([
		['spotify-rec', PrismaRecommendationSource.SPOTIFY_REC],
		['spotify-taste', PrismaRecommendationSource.SPOTIFY_TASTE],
		['seed-similar', PrismaRecommendationSource.SEED_SIMILAR],
		['lastfm-loved', PrismaRecommendationSource.LASTFM_LOVED],
		['lastfm-similar', PrismaRecommendationSource.LASTFM_SIMILAR],
		['lastfm-genre-fallback', PrismaRecommendationSource.LASTFM_GENRE_FALLBACK],
		['artist-fallback', PrismaRecommendationSource.ARTIST_FALLBACK],
		['genre-tag', PrismaRecommendationSource.GENRE_TAG],
	])('maps %s to %s', (source, expected) => {
		const result = recommendationSourceToPrisma(source as any)
		expect(result).toBe(expected)
	})
})
