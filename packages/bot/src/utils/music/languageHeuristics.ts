const SPANISH_ACCENTS = /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/
const SPANISH_GENRE_MARKERS = [
	'latin',
	'reggaeton',
	'forró',
	'bachata',
	'salsa',
	'spanish pop',
	'latin pop',
	'trap latino',
	'reggaeton trap',
	'cumbia',
	'banda',
	'ranchera',
	'champeta',
]
const SPANISH_STOPWORDS = [
	'el',
	'la',
	'los',
	'las',
	'de',
	'que',
	'una',
	'para',
	'por',
	'con',
	'sin',
	'del',
	'uno',
	'este',
	'ese',
]

function hasSpanishAccents(text: string): boolean {
	return SPANISH_ACCENTS.test(text)
}

function countSpanishStopwords(text: string): number {
	const normalized = text.toLowerCase()
	return SPANISH_STOPWORDS.filter((word) => {
		const regex = new RegExp(`\\b${word}\\b`)
		return regex.test(normalized)
	}).length
}

export function detectSpanishMarkers(
	text: string | undefined,
	genres: string[] | undefined,
): boolean {
	if (!text && !genres) return false

	if (text && text.length > 0) {
		if (hasSpanishAccents(text)) return true

		const spanishStopwords = countSpanishStopwords(text)
		if (spanishStopwords > 0) return true
	}

	if (genres && genres.length > 0) {
		const normalized = genres.map((g) => g.toLowerCase())
		const hasLatinFamily = SPANISH_GENRE_MARKERS.some((marker) =>
			normalized.some((g) => g.includes(marker.toLowerCase())),
		)
		if (hasLatinFamily) return true
	}

	return false
}

export function detectSessionLanguageMarkers(
	recentTracks: Array<{
		title?: string
		author?: string
		genre?: string
		tags?: string[]
	}>,
): { hasSpanish: boolean; hasEnglish: boolean } {
	if (!recentTracks || recentTracks.length === 0) {
		return { hasSpanish: false, hasEnglish: true }
	}

	let spanishCount = 0
	let nonSpanishCount = 0

	for (const track of recentTracks) {
		const text = `${track.title || ''} ${track.author || ''}`.trim()
		const genres = track.tags?.join(' ') || track.genre || ''

		if (detectSpanishMarkers(text, [genres])) {
			spanishCount++
		} else {
			nonSpanishCount++
		}
	}

	return {
		hasSpanish: spanishCount > 0,
		hasEnglish: nonSpanishCount > 0,
	}
}
