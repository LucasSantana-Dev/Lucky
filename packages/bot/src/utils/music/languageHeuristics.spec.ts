import { detectSpanishMarkers, detectSessionLanguageMarkers } from './languageHeuristics'

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
	})
})
