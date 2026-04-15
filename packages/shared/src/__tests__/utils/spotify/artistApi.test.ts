import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
	searchSpotifyArtists,
	getSpotifyRelatedArtists,
	type SpotifyArtist,
} from '../../../../src/utils/spotify/artistApi'

describe('Spotify Artist API', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	const mockArtist: SpotifyArtist = {
		id: 'spotify-1',
		name: 'Drake',
		imageUrl: 'https://example.com/image.jpg',
		popularity: 85,
		genres: ['hip-hop', 'rap'],
	}

	describe('getSpotifyRelatedArtists', () => {
		test('should return unique artists from recommendations', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							tracks: [
								{
									artists: [
										{
											id: 'artist-1',
											name: 'Artist One',
											images: [{ url: 'http://example.com/img1.jpg' }],
											popularity: 80,
											genres: ['pop'],
										},
										{
											id: 'artist-2',
											name: 'Artist Two',
											images: [{ url: 'http://example.com/img2.jpg' }],
											popularity: 75,
											genres: ['rock'],
										},
									],
								},
								{
									artists: [
										{
											id: 'artist-3',
											name: 'Artist Three',
											images: [{ url: 'http://example.com/img3.jpg' }],
											popularity: 70,
											genres: ['jazz'],
										},
									],
								},
							],
						}),
						{ status: 200 },
					),
				)

			const result = await getSpotifyRelatedArtists('access-token', 'seed-artist')

			expect(result).toHaveLength(3)
			expect(result[0].id).toBe('artist-1')
			expect(result[1].id).toBe('artist-2')
			expect(result[2].id).toBe('artist-3')
			fetchSpy.mockRestore()
		})

		test('should deduplicate duplicate artist ids in recommendations', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							tracks: [
								{
									artists: [
										{
											id: 'artist-1',
											name: 'Artist One',
											images: [{ url: 'http://example.com/img1.jpg' }],
											popularity: 80,
											genres: ['pop'],
										},
									],
								},
								{
									artists: [
										{
											id: 'artist-1',
											name: 'Artist One',
											images: [{ url: 'http://example.com/img1.jpg' }],
											popularity: 80,
											genres: ['pop'],
										},
									],
								},
							],
						}),
						{ status: 200 },
					),
				)

			const result = await getSpotifyRelatedArtists('access-token', 'seed-artist')

			expect(result).toHaveLength(1)
			expect(result[0].id).toBe('artist-1')
			fetchSpy.mockRestore()
		})

		test('should handle API 403 error gracefully', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ error: 'Forbidden' }), {
						status: 403,
					}),
				)

			const result = await getSpotifyRelatedArtists('invalid-token', 'artist-id')

			expect(result).toEqual([])
			fetchSpy.mockRestore()
		})

		test('should handle empty response', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ tracks: [] }), { status: 200 }),
				)

			const result = await getSpotifyRelatedArtists('access-token', 'artist-id')

			expect(result).toEqual([])
			fetchSpy.mockRestore()
		})

		test('should limit results to 12 artists', async () => {
			const tracks = Array.from({ length: 20 }, (_, i) => ({
				artists: [
					{
						id: `artist-${i}`,
						name: `Artist ${i}`,
						images: [{ url: `http://example.com/img${i}.jpg` }],
						popularity: 80 - i,
						genres: ['pop'],
					},
				],
			}))

			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ tracks }), { status: 200 }),
				)

			const result = await getSpotifyRelatedArtists('access-token', 'artist-id')

			expect(result).toHaveLength(12)
			fetchSpy.mockRestore()
		})
	})

	describe('searchSpotifyArtists', () => {
		test('should return artists matching search query', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							artists: {
								items: [mockArtist],
							},
						}),
						{ status: 200 },
					),
				)

			const result = await searchSpotifyArtists('access-token', 'Drake')

			expect(result).toHaveLength(1)
			expect(result[0].name).toBe('Drake')
			fetchSpy.mockRestore()
		})

		test('should return empty array for empty query', async () => {
			const result = await searchSpotifyArtists('access-token', '   ')

			expect(result).toEqual([])
		})

		test('should handle API errors gracefully', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
					}),
				)

			const result = await searchSpotifyArtists('bad-token', 'Drake')

			expect(result).toEqual([])
			fetchSpy.mockRestore()
		})

		test('should handle network errors gracefully', async () => {
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockRejectedValueOnce(new Error('Network error'))

			const result = await searchSpotifyArtists('access-token', 'Drake')

			expect(result).toEqual([])
			fetchSpy.mockRestore()
		})
	})
})
