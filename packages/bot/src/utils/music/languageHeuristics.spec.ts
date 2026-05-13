import {
	detectSpanishMarkers,
	detectPortugueseMarkers,
	detectSessionLanguageMarkers,
} from './languageHeuristics'

describe('languageHeuristics', () => {
	describe('detectSpanishMarkers', () => {
		it('should detect Spanish accents', () => {
			expect(detectSpanishMarkers('El Niño', undefined)).toBe(true)
			expect(detectSpanishMarkers('Corazón Roto', undefined)).toBe(true)
		})

		it('should detect Spanish stopwords', () => {
			expect(detectSpanishMarkers('el que para la', undefined)).toBe(true)
		})

		it('should detect Spanish genre markers', () => {
			expect(detectSpanishMarkers(undefined, ['reggaeton', 'latin pop'])).toBe(true)
			expect(detectSpanishMarkers(undefined, ['salsa', 'bachata'])).toBe(true)
		})

		it('should not detect Spanish in English text', () => {
			expect(detectSpanishMarkers('Hello World', undefined)).toBe(false)
			expect(detectSpanishMarkers('The Quick Brown Fox', undefined)).toBe(false)
		})

		it('should not detect Spanish in English genres', () => {
			expect(detectSpanishMarkers(undefined, ['hip hop', 'rock', 'pop'])).toBe(false)
		})

		it('should combine text and genre markers', () => {
			expect(detectSpanishMarkers('Niño', ['reggaeton'])).toBe(true)
		})

		it('should detect Spanish gospel/Christian markers', () => {
			expect(detectSpanishMarkers('Dios es bueno', undefined)).toBe(true)
			expect(detectSpanishMarkers('Señor de mi corazón', undefined)).toBe(
				true,
			)
			expect(detectSpanishMarkers('Aleluya Cristo Vive', undefined)).toBe(
				true,
			)
		})

		it('should detect "Tu Gloria"-style Spanish gospel titles', () => {
			expect(
				detectSpanishMarkers('Derrama Tu Gloria', ['latin christian']),
			).toBe(true)
			expect(detectSpanishMarkers('Derrama Tu Gloria', undefined)).toBe(
				true,
			)
		})

		it('should not classify Brazilian Portuguese titles as Spanish', () => {
			expect(detectSpanishMarkers('Coração Brasileiro', undefined)).toBe(
				false,
			)
			expect(
				detectSpanishMarkers('Não Quero Mais', undefined),
			).toBe(false)
			expect(detectSpanishMarkers('Liderança', undefined)).toBe(false)
			expect(
				detectSpanishMarkers('Só Rock 3', ['rap', 'funk carioca']),
			).toBe(false)
		})

		it('should not classify Portuguese gospel as Spanish', () => {
			expect(
				detectSpanishMarkers('Glória a Deus', undefined),
			).toBe(false)
			expect(
				detectSpanishMarkers('Senhor Eu Sou Teu Servo', undefined),
			).toBe(false)
		})

		it('should detect Spanish worship titles without ñ/¿/¡', () => {
			// These slip through when Last.fm tags are absent — common gospel titles
			expect(detectSpanishMarkers('Eres Fiel', undefined)).toBe(true)
			expect(detectSpanishMarkers('Fuego de Tu Presencia', undefined)).toBe(true)
			expect(detectSpanishMarkers('Los Cielos Cuentan', undefined)).toBe(true)
			expect(detectSpanishMarkers('Tiempo de Alabanza', undefined)).toBe(true)
			expect(detectSpanishMarkers('Tu Gracia', undefined)).toBe(true)
			expect(detectSpanishMarkers('Gracias a Dios', undefined)).toBe(true)
			expect(detectSpanishMarkers('Nuevo Corazon', undefined)).toBe(true)
			expect(detectSpanishMarkers('Pueblo de Dios', undefined)).toBe(true)
			expect(detectSpanishMarkers('Llena Mi Copa', undefined)).toBe(true)
			expect(detectSpanishMarkers('Una Noche Mas', undefined)).toBe(true)
		})

		it('should not flag English or Portuguese tracks on new tokens', () => {
			expect(detectSpanishMarkers('Amazing Grace', undefined)).toBe(false)
			expect(detectSpanishMarkers('Hillsong United', undefined)).toBe(false)
			// Portuguese "presença" uses ç — won't match "presencia"
			expect(detectSpanishMarkers('Presença de Deus', undefined)).toBe(false)
			// Portuguese "graça" uses ç — won't match "gracia"
			expect(detectSpanishMarkers('Graça e Paz', undefined)).toBe(false)
		})

		it('should let Portuguese veto win when both signals appear', () => {
			// Brazilian artist Anitta has English/Spanish/Portuguese mixes.
			// "El Que Espera Por Mim" — has Spanish stopwords ("el") but
			// Portuguese-distinct "mim" should keep this in Portuguese.
			expect(
				detectSpanishMarkers('Não te quiero pero também não te perdono', undefined),
			).toBe(false)
		})

		it('should detect new Spanish worship genre markers', () => {
			expect(detectSpanishMarkers(undefined, ['latin worship'])).toBe(true)
			expect(detectSpanishMarkers(undefined, ['ccm en español'])).toBe(true)
			expect(detectSpanishMarkers(undefined, ['spanish ccm'])).toBe(true)
		})

		it('should detect new Spanish gospel distinct tokens', () => {
			expect(detectSpanishMarkers('eres mi todo', undefined)).toBe(true)
			expect(detectSpanishMarkers('nuestro padre celestial', undefined)).toBe(true)
			expect(detectSpanishMarkers('nuestra esperanza', undefined)).toBe(true)
			expect(detectSpanishMarkers('nuestros corazones', undefined)).toBe(true)
			expect(detectSpanishMarkers('nuestras vidas', undefined)).toBe(true)
			expect(detectSpanishMarkers('siervo fiel', undefined)).toBe(true)
			expect(detectSpanishMarkers('sierva del señor', undefined)).toBe(true)
			expect(detectSpanishMarkers('digno de alabanza', undefined)).toBe(true)
			expect(detectSpanishMarkers('fuego de dios', undefined)).toBe(true)
			expect(detectSpanishMarkers('reina en los cielos', undefined)).toBe(true)
		})

		it('should not false-positive English text with new tokens', () => {
			// "eres" is not an English word
			expect(detectSpanishMarkers('Greatest Hits Vol 1', undefined)).toBe(false)
			// "fuego" does not appear in ordinary English titles
			expect(detectSpanishMarkers('Fire and Rain', undefined)).toBe(false)
		})

		it('should not classify Portuguese text containing overlapping words as Spanish', () => {
			// "nosso" (not "nuestro") is the Portuguese equivalent; must not match
			expect(detectSpanishMarkers('O Nosso Amor', undefined)).toBe(false)
			// "servo" is the Portuguese word, not "siervo"; must not match
			expect(detectSpanishMarkers('Servo Fiel do Senhor', undefined)).toBe(false)
		})

		it('should detect Spanish gospel title via multiple new tokens together', () => {
			// "Eres digno" — common Spanish worship song title fragment
			expect(detectSpanishMarkers('Eres Digno y Santo', undefined)).toBe(true)
			// "Nuestro Dios" — title of a popular Spanish worship song
			expect(detectSpanishMarkers('Nuestro Dios', undefined)).toBe(true)
		})
	})

	describe('detectPortugueseMarkers', () => {
		it('detects Portuguese-only diacritics', () => {
			expect(detectPortugueseMarkers('Coração')).toBe(true)
			expect(detectPortugueseMarkers('Não')).toBe(true)
			expect(detectPortugueseMarkers('Liderança')).toBe(true)
		})

		it('detects Portuguese-distinct stopwords', () => {
			expect(detectPortugueseMarkers('eu sou meu')).toBe(true)
			expect(detectPortugueseMarkers('voce esta certo')).toBe(true)
		})

		it('returns false for Spanish-only text', () => {
			expect(detectPortugueseMarkers('El Niño')).toBe(false)
			expect(detectPortugueseMarkers('Corazón Roto')).toBe(false)
		})

		it('returns false for English text', () => {
			expect(detectPortugueseMarkers('Hello World')).toBe(false)
		})
	})

	describe('detectSessionLanguageMarkers', () => {
		it('should return English session with no Spanish tracks', () => {
			const tracks = [
				{ title: 'Shape of You', author: 'Ed Sheeran', tags: ['pop'] },
				{ title: 'Blinding Lights', author: 'The Weeknd', tags: ['synthwave pop'] },
				{ title: 'Levitating', author: 'Dua Lipa', tags: ['pop'] },
			]
			const result = detectSessionLanguageMarkers(tracks)
			expect(result.hasSpanish).toBe(false)
			expect(result.hasEnglish).toBe(true)
		})

		it('should return Spanish session with Spanish tracks', () => {
			const tracks = [
				{ title: 'Gasolina', author: 'Daddy Yankee', tags: ['reggaeton'] },
				{ title: 'Despacito', author: 'Luis Fonsi', tags: ['reggaeton'] },
				{ title: 'El Perdón', author: 'Nicky Jam', tags: ['reggaeton'] },
			]
			const result = detectSessionLanguageMarkers(tracks)
			expect(result.hasSpanish).toBe(true)
		})

		it('should return mixed session with both languages', () => {
			const tracks = [
				{ title: 'Shape of You', author: 'Ed Sheeran', tags: ['pop'] },
				{ title: 'Despacito', author: 'Luis Fonsi', tags: ['reggaeton'] },
				{ title: 'Levitating', author: 'Dua Lipa', tags: ['pop'] },
			]
			const result = detectSessionLanguageMarkers(tracks)
			expect(result.hasSpanish).toBe(true)
			expect(result.hasEnglish).toBe(true)
		})

		it('should return English as default for empty history', () => {
			const result = detectSessionLanguageMarkers([])
			expect(result.hasSpanish).toBe(false)
			expect(result.hasEnglish).toBe(true)
		})

		it('flags Portuguese sessions as not Spanish', () => {
			const tracks = [
				{ title: 'Coração Brasileiro', author: 'Anitta', tags: ['mpb'] },
				{ title: 'Liderança', author: 'Major RD', tags: ['rap'] },
				{ title: 'Não Quero Mais', author: 'Marisa Monte', tags: ['mpb'] },
			]
			const result = detectSessionLanguageMarkers(tracks)
			expect(result.hasSpanish).toBe(false)
			expect(result.hasPortuguese).toBe(true)
		})

		it('keeps a Brazilian rap session out of the Spanish bucket', () => {
			// Repro for the 2026-04-24 bug: the user's session was
			// Brazilian rap and the autoplay must not classify it as
			// Spanish (which would disable the cross-locale veto).
			const tracks = [
				{
					title: 'Só Rock 3',
					author: 'Major RD',
					tags: ['rap', 'funk carioca'],
				},
				{
					title: 'Liderança',
					author: 'Major RD',
					tags: ['rap'],
				},
			]
			const result = detectSessionLanguageMarkers(tracks)
			expect(result.hasSpanish).toBe(false)
		})
	})
})
