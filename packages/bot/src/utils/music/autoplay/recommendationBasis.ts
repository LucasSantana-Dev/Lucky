/**
 * Recommendation basis types for autoplay track selection.
 * Tracks the source and signals that led to a candidate track being scored.
 */

export type RecommendationSource =
	| 'spotify-rec'
	| 'spotify-taste'
	| 'lastfm-loved'
	| 'lastfm-similar'
	| 'lastfm-genre-fallback'
	| 'artist-fallback'
	| 'genre-tag'

export type RecommendationSignal =
	| 'preferred-artist'
	| 'favourite-artist'
	| 'liked-artist'
	| 'known-artist'
	| 'liked-track'
	| 'completed-before'
	| 'similar-energy'
	| 'genre-match'
	| 'deep-dive'
	| 'discovery'
	| 'session-novelty'
	| 'album-match'
	| 'long-track-match'
	| 'quick-hit-match'
	| 'restless-discovery'
	| 'energy-match'
	| 'source-variety'
	| 'similar-title-mood'
	| 'skipped-before'
	| 'long-track-penalty'
	| 'version-variant'
	| 'low-quality-upload'

export interface RecommendationBasis {
	source: RecommendationSource
	signals: RecommendationSignal[]
}

/**
 * Formats a recommendation basis as a human-friendly label for Discord display.
 * Produces clean output without duplicates, mapping the source to a readable label first,
 * then appending significant signals.
 *
 * Example output: "spotify rec • preferred artist, liked track"
 *
 * @param basis - The recommendation basis containing source and signals
 * @returns Formatted string suitable for Discord display
 */
export function serializeBasis(basis: RecommendationBasis): string {
	// Map sources to human-readable labels
	const sourceLabels: Record<RecommendationSource, string> = {
		'spotify-rec': 'spotify rec',
		'spotify-taste': 'spotify taste',
		'lastfm-loved': 'last.fm loved',
		'lastfm-similar': 'last.fm similar',
		'lastfm-genre-fallback': 'last.fm genre',
		'artist-fallback': 'artist fallback',
		'genre-tag': 'genre tag',
	}

	// Map signals to human-readable labels
	const signalLabels: Record<RecommendationSignal, string> = {
		'preferred-artist': 'preferred artist',
		'favourite-artist': 'favourite artist',
		'liked-artist': 'liked artist',
		'known-artist': 'known artist',
		'liked-track': 'liked track',
		'completed-before': 'completed before',
		'similar-energy': 'similar energy',
		'genre-match': 'genre match',
		'deep-dive': 'deep dive',
		'discovery': 'discovery',
		'session-novelty': 'session novelty',
		'album-match': 'album match',
		'long-track-match': 'long track match',
		'quick-hit-match': 'quick hit match',
		'restless-discovery': 'restless discovery',
		'energy-match': 'energy match',
		'source-variety': 'source variety',
		'similar-title-mood': 'similar title/mood',
		'skipped-before': 'skipped before',
		'long-track-penalty': 'long track penalty',
		'version-variant': 'version variant',
		'low-quality-upload': 'low quality upload',
	}

	const sourceLabel = sourceLabels[basis.source]

	// Convert signals to labels and remove duplicates
	const uniqueSignals = Array.from(new Set(basis.signals))
	const signalLabelsFormatted = uniqueSignals.map((signal) => signalLabels[signal])

	// Combine source with signals
	if (signalLabelsFormatted.length === 0) {
		return sourceLabel
	}

	return `${sourceLabel} • ${signalLabelsFormatted.join(', ')}`
}
