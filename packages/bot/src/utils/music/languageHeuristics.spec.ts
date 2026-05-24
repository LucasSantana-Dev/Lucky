import {
	detectSpanishMarkers,
	detectPortugueseMarkers,
	detectSessionLanguageMarkers,
} from './languageHeuristics'

describe('languageHeuristics', () => {
	describe('detectSpanishMarkers', () => {
		it.each([
			['El Niño', undefined, true],
			['Corazón Roto', undefined, true],
			['el que para la', undefined, true],
			[undefined, ['reggaeton', 'latin pop'], true],
			[undefined, ['salsa', 'bachata'], true],
			['Niño', ['reggaeton'], true],
			['Hello World', undefined, false],
			['The Quick Brown Fox', undefined, false],
			[undefined, ['hip hop', 'rock', 'pop'], false],
			['Dios es bueno', undefined, true],
			['Señor de mi corazón', undefined, true],
			['Aleluya Cristo Vive', undefined, true],
			['Derrama Tu Gloria', ['latin christian'], true],
			['Derrama Tu Gloria', undefined, true],
			['Coração Brasileiro', undefined, false],
			['Não Quero Mais', undefined, false],
			['Liderança', undefined, false],
			['Só Rock 3', ['rap', 'funk carioca'], false],
			['Glória a Deus', undefined, false],
			['Senhor Eu Sou Teu Servo', undefined, false],
			['Eres Fiel', undefined, true],
			['Fuego de Tu Presencia', undefined, true],
			['Los Cielos Cuentan', undefined, true],
			['Tiempo de Alabanza', undefined, true],
			['Tu Gracia', undefined, true],
			['Gracias a Dios', undefined, true],
			['Nuevo Corazon', undefined, true],
			['Pueblo de Dios', undefined, true],
			['Llena Mi Copa', undefined, true],
			['Una Noche Mas', undefined, true],
			['Amazing Grace', undefined, false],
			['Hillsong United', undefined, false],
			['Presença de Deus', undefined, false],
			['Graça e Paz', undefined, false],
			['Não te quiero pero também não te perdono', undefined, false],
			['eres mi todo', undefined, true],
			['nuestro padre celestial', undefined, true],
			['nuestra esperanza', undefined, true],
			['nuestros corazones', undefined, true],
			['nuestras vidas', undefined, true],
			['siervo fiel', undefined, true],
			['sierva del señor', undefined, true],
			['digno de alabanza', undefined, true],
			['fuego de dios', undefined, true],
			['reina en los cielos', undefined, true],
			['Greatest Hits Vol 1', undefined, false],
			['Fire and Rain', undefined, false],
			['O Nosso Amor', undefined, false],
			['Servo Fiel do Senhor', undefined, false],
			['Eres Digno y Santo', undefined, true],
			['Nuestro Dios', undefined, true],
		])('Spanish detection: %s', (title, genres, expected) => {
			expect(detectSpanishMarkers(title, genres)).toBe(expected)
		})

		it.each([
			[['latin worship'], true],
			[['ccm en español'], true],
			[['spanish ccm'], true],
		])('Spanish worship genre markers: %s', (genres, expected) => {
			expect(detectSpanishMarkers(undefined, genres)).toBe(expected)
		})
	})

	describe('detectPortugueseMarkers', () => {
		it.each([
			['Coração', true],
			['eu sou meu', true],
			['El Niño', false],
		])('Portuguese markers: %s', (text, expected) => {
			expect(detectPortugueseMarkers(text)).toBe(expected)
		})
	})

	describe('detectSessionLanguageMarkers', () => {
		it('should detect English, Spanish, and mixed sessions', () => {
			const englishTracks = [
				{ title: 'Shape of You', author: 'Ed Sheeran', tags: ['pop'] },
			]
			const spanishTracks = [
				{ title: 'Gasolina', author: 'Daddy Yankee', tags: ['reggaeton'] },
			]
			const mixedTracks = [
				{ title: 'Shape of You', author: 'Ed Sheeran', tags: ['pop'] },
				{ title: 'Despacito', author: 'Luis Fonsi', tags: ['reggaeton'] },
			]
			expect(detectSessionLanguageMarkers(englishTracks).hasEnglish).toBe(true)
			expect(detectSessionLanguageMarkers(spanishTracks).hasSpanish).toBe(true)
			const mixed = detectSessionLanguageMarkers(mixedTracks)
			expect(mixed.hasSpanish).toBe(true)
			expect(mixed.hasEnglish).toBe(true)
		})

		it('should return English as default for empty history', () => {
			const result = detectSessionLanguageMarkers([])
			expect(result.hasEnglish).toBe(true)
		})

		it('should distinguish Portuguese from Spanish', () => {
			const ptTracks = [
				{ title: 'Coração Brasileiro', author: 'Anitta', tags: ['mpb'] },
			]
			const result = detectSessionLanguageMarkers(ptTracks)
			expect(result.hasSpanish).toBe(false)
			expect(result.hasPortuguese).toBe(true)
		})
	})
})
