// Spanish-only diacritics: Portuguese never uses ñ, ¿, ¡, ü.
const SPANISH_ONLY_DIACRITICS = /[ñ¿¡üÑÜ]/
// Portuguese-only diacritics: Spanish never uses ã, õ, ç.
const PORTUGUESE_ONLY_DIACRITICS = /[ãõçÃÕÇ]/

const SPANISH_GENRE_MARKERS = [
	'latin',
	'reggaeton',
	'bachata',
	'salsa',
	'spanish',
	'spanish pop',
	'latin pop',
	'trap latino',
	'reggaeton trap',
	'cumbia',
	'banda',
	'ranchera',
	'champeta',
	'musica cristiana',
	'música cristiana',
	'latin christian',
	'latin gospel',
	'spanish gospel',
	'reggaetón',
	'tex-mex',
	'norteño',
	'norteno',
	'corrido',
	'mariachi',
	'dembow',
	'merengue',
	'vallenato',
	'trap latino',
	'latin trap',
]

// Words where Spanish and Portuguese spellings differ. Hits here are strong
// Spanish signals because the Portuguese spelling would not match.
const SPANISH_DISTINCT_TOKENS = [
	'el', 'la', 'los', 'las', 'del',
	'una', 'uno',
	'yo', 'mi', 'mis',
	'soy', 'estoy', 'estás', 'estan',
	'muy',
	'aquí', 'allí', 'ahí',
	'tú', 'mí',
	'más',
	'pero',
	'donde',
	'cuando',
	'también',
	'siempre',
	'nunca',
	'bueno',
	'pequeño', 'pequeña',
	'señor', 'señora', 'señorita',
	'dios',
	'iglesia',
	'cristo', 'jesucristo',
	'espíritu', 'espiritu',
	'aleluya',
	'adoración', 'adoracion',
	'bendición', 'bendicion',
	'oración', 'oracion',
	'corazón',
	'niño', 'niña', 'niños', 'niñas',
	'tu gloria',
	'tus alabanzas',
]

// Words distinctive to Portuguese (Brazilian or European). Hits here veto
// the Spanish classification — useful because some artist names like
// "ALISON" or single-word titles can otherwise look ambiguous.
const PORTUGUESE_DISTINCT_TOKENS = [
	'não', 'nao',
	'você', 'voce', 'vocês', 'voces',
	'sou', 'somos',
	'meu', 'minha', 'meus', 'minhas',
	'nós',
	'são',
	'também',
	'obrigado', 'obrigada',
	'paixão',
	'coração',
	'família',
	'muito',
	'agora',
	'hoje',
	'ontem',
	'amanhã',
	'amanha',
	'pra', 'pro',
	'eu',
	'tudo',
	'então', 'entao',
	'mais nada',
	'só',
	'vamos embora',
	'irmão', 'irmã',
	'deus',
	'senhor', 'senhora',
	'igreja',
	'espírito', 'espirito',
	'aleluia',
	'adoração',
	'glória',
]

function countMatches(text: string, tokens: string[]): number {
	if (!text) return 0
	const lower = text.toLowerCase()
	let count = 0
	for (const token of tokens) {
		const escaped = token.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const re = new RegExp(`(?:^|[^a-záéíóúüñãõç])${escaped}(?:$|[^a-záéíóúüñãõç])`, 'i')
		if (re.test(lower)) count++
	}
	return count
}

export interface LanguageScore {
	spanishScore: number
	portugueseScore: number
	hasSpanishGenreTag: boolean
}

export function scoreLanguageMarkers(
	text: string | undefined,
	genres: string[] | undefined,
): LanguageScore {
	const safeText = (text ?? '').trim()

	let spanishScore = 0
	let portugueseScore = 0

	if (safeText.length > 0) {
		if (SPANISH_ONLY_DIACRITICS.test(safeText)) spanishScore += 2
		if (PORTUGUESE_ONLY_DIACRITICS.test(safeText)) portugueseScore += 2

		spanishScore += countMatches(safeText, SPANISH_DISTINCT_TOKENS)
		portugueseScore += countMatches(safeText, PORTUGUESE_DISTINCT_TOKENS)

		// Genre keywords in the title itself are a strong locale signal —
		// "Reggaeton mix", "Cumbia caliente", "Bachata Rosa" etc.
		const genreTokenHits = countMatches(safeText, SPANISH_GENRE_MARKERS)
		if (genreTokenHits > 0) spanishScore += 2
	}

	let hasSpanishGenreTag = false
	if (genres && genres.length > 0) {
		const normalized = genres.map((g) => g.toLowerCase())
		hasSpanishGenreTag = SPANISH_GENRE_MARKERS.some((marker) =>
			normalized.some((g) => g.includes(marker.toLowerCase())),
		)
		if (hasSpanishGenreTag) spanishScore += 2
	}

	return { spanishScore, portugueseScore, hasSpanishGenreTag }
}

export function detectSpanishMarkers(
	text: string | undefined,
	genres: string[] | undefined,
): boolean {
	const score = scoreLanguageMarkers(text, genres)
	if (score.spanishScore === 0) return false
	// Portuguese veto: Brazilian/Portuguese content nearly always carries at
	// least one distinctive marker (ã, ç, "não", "você", "muito", "minha").
	// If portuguese signal is at least as strong as spanish, decline the
	// classification — the candidate is likely Portuguese, not Spanish.
	return score.spanishScore > score.portugueseScore
}

export function detectPortugueseMarkers(
	text: string | undefined,
): boolean {
	const score = scoreLanguageMarkers(text, undefined)
	return score.portugueseScore > 0 && score.portugueseScore >= score.spanishScore
}

export function detectSessionLanguageMarkers(
	recentTracks: Array<{
		title?: string
		author?: string
		genre?: string
		tags?: string[]
	}>,
): { hasSpanish: boolean; hasEnglish: boolean; hasPortuguese: boolean } {
	if (!recentTracks || recentTracks.length === 0) {
		return { hasSpanish: false, hasEnglish: true, hasPortuguese: false }
	}

	let spanishCount = 0
	let portugueseCount = 0
	let otherCount = 0

	for (const track of recentTracks) {
		const text = `${track.title ?? ''} ${track.author ?? ''}`.trim()
		const genres = track.tags ?? (track.genre ? [track.genre] : [])

		if (detectSpanishMarkers(text, genres)) {
			spanishCount++
		} else if (detectPortugueseMarkers(text)) {
			portugueseCount++
		} else {
			otherCount++
		}
	}

	return {
		hasSpanish: spanishCount > 0,
		hasEnglish: otherCount > 0,
		hasPortuguese: portugueseCount > 0,
	}
}
