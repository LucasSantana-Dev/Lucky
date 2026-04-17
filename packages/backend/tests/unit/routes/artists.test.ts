import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import type { Express } from 'express'
import { setupArtistsRoutes } from '../../../src/routes/artists'
import {
	searchSpotifyArtists,
	getSpotifyRelatedArtists,
	getPrismaClient,
	errorLog,
} from '@lucky/shared/utils'
import {
	getSpotifyClientToken,
	isSpotifyAuthConfigured,
} from '../../../src/services/SpotifyAuthService'
import { spotifyLinkService } from '@lucky/shared/services'
import {
	createMockRequest,
	createMockResponse,
} from '../../fixtures/test-helpers'

jest.mock('@lucky/shared/utils', () => ({
	errorLog: jest.fn(),
	getPrismaClient: jest.fn(),
	searchSpotifyArtists: jest.fn(),
	getSpotifyRelatedArtists: jest.fn(),
}))

jest.mock('../../../src/services/SpotifyAuthService', () => ({
	getSpotifyClientToken: jest.fn(),
	isSpotifyAuthConfigured: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
	spotifyLinkService: {
		getValidAccessToken: jest.fn(),
	},
})

jest.mock('../../../src/middleware/rateLimit', () => ({
	apiLimiter: (_req: any, _res: any, next: any) => next?.(),
	writeLimiter: (_req: any, _res: any, next: any) => next?.(),
}))

jest.mock('../../../src/middleware/auth', () => ({
	requireAuth: (_req: any, _res: any, next: any) => next?.(),
})))

// Helper to extract handler from mocked Express app route registration
// Routes now have middleware, so handler is at the last index
function getRouteHandler(mockMethod: any, index = 0): any {
	const call = mockMethod.mock.calls[index]
	// Find the last argument which should be the handler function
	return call[call.length - 1]
}



const mockApp = {
	get: jest.fn(),
	post: jest.fn(),
	put: jest.fn(),
	delete: jest.fn(),
} as unknown as Express

const mockArtist = {
	id: 'spotify-1',
	name: 'Drake',
	imageUrl: 'https://example.com/image.jpg',
	popularity: 85,
	genres: ['hip-hop', 'rap'],
}

const mockPreference = {
	id: 'pref-1',
	discordUserId: 'discord-123',
	guildId: 'guild-1',
	artistKey: 'drake',
	artistName: 'Drake',
	spotifyId: 'spotify-1',
	imageUrl: 'https://example.com/image.jpg',
	preference: 'prefer' as const,
	createdAt: new Date(),
	updatedAt: new Date(),
}

describe('Artists Routes', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
		;(getSpotifyClientToken as jest.Mock).mockResolvedValue('client-token')
		;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
			null,
		)
	})

	describe('GET /api/artists/suggestions', () => {
		test('should return user top artists when OAuth link exists', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
			}) as any
			const res = createMockResponse()

			;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
				'user-token',
			)

			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockResolvedValue(
					new Response(
						JSON.stringify({
							items: [
								{
									id: 'top-1',
									name: 'Kanye West',
									images: [{ url: 'https://example.com/kanye.jpg' }],
									popularity: 90,
									genres: ['hip-hop'],
								},
							],
						}),
						{ status: 200 },
					),
				)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 0)

			await handler(req, res)

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					artists: expect.any(Array),
				}),
			)
			expect(res.json.mock.calls[0][0].artists.length).toBeGreaterThan(0)

			fetchSpy.mockRestore()
		})

		test('should fall back to popular artists search when OAuth fails', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
			}) as any
			const res = createMockResponse()

			;(spotifyLinkService.getValidAccessToken as jest.Mock).mockResolvedValue(
				'user-token',
			)
			const fetchSpy = jest
				.spyOn(global, 'fetch')
				.mockRejectedValueOnce(new Error('Network error'))

			;(searchSpotifyArtists as jest.Mock).mockResolvedValue([mockArtist])

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 0)

			await handler(req, res)

			expect(searchSpotifyArtists as jest.Mock).toHaveBeenCalled()
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					artists: expect.any(Array),
				}),
			)

			fetchSpy.mockRestore()
		})

		test('should return 401 when not authenticated', async () => {
			const req = createMockRequest({
				user: undefined,
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(401)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Not authenticated',
			})
		})

		test('should return 503 when Spotify not configured', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
			}) as any
			const res = createMockResponse()

			;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(false)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(503)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Spotify not configured',
			})
		})

		test('should return 503 when unable to get Spotify token', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
			}) as any
			const res = createMockResponse()

			;(getSpotifyClientToken as jest.Mock).mockResolvedValue(null)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(503)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Failed to get Spotify token',
			})
		})

		test('should handle unexpected errors gracefully', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
			}) as any
			const res = createMockResponse()

			;(spotifyLinkService.getValidAccessToken as jest.Mock).mockRejectedValue(
				new Error('Unexpected error'),
			)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 0)

			await handler(req, res)

			expect(errorLog as jest.Mock).toHaveBeenCalled()
			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Failed to get suggestions',
			})
		})
	})

	describe('GET /api/artists/search', () => {
		test('should search artists by query', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				query: { q: 'Drake' },
			}) as any
			const res = createMockResponse()

			;(searchSpotifyArtists as jest.Mock).mockResolvedValue([mockArtist])

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 1)

			await handler(req, res)

			expect(searchSpotifyArtists as jest.Mock).toHaveBeenCalledWith(
				'client-token',
				'Drake',
				12,
			)
			expect(res.json).toHaveBeenCalledWith({
				artists: [mockArtist],
			})
		})

		test('should return 400 when query parameter is missing', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				query: {},
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 1)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Missing query parameter q',
			})
		})

		test('should return 500 on search error', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				query: { q: 'Drake' },
			}) as any
			const res = createMockResponse()

			;(searchSpotifyArtists as jest.Mock).mockRejectedValue(
				new Error('Spotify API error'),
			)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 1)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Failed to search artists',
			})
		})
	})

	describe('GET /api/artists/:artistId/related', () => {
		test('should fetch related artists', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				params: { artistId: 'spotify-1' },
			}) as any
			const res = createMockResponse()

			;(getSpotifyRelatedArtists as jest.Mock).mockResolvedValue([
				mockArtist,
			])

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 2)

			await handler(req, res)

			expect(getSpotifyRelatedArtists as jest.Mock).toHaveBeenCalledWith(
				'client-token',
				'spotify-1',
			)
			expect(res.json).toHaveBeenCalledWith({
				artists: [mockArtist],
			})
		})

		test('should return 500 on related artists error', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				params: { artistId: 'spotify-1' },
			}) as any
			const res = createMockResponse()

			;(getSpotifyRelatedArtists as jest.Mock).mockRejectedValue(
				new Error('API error'),
			)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 2)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Failed to get related artists',
			})
		})
	})

	describe('GET /api/users/me/preferred-artists', () => {
		test('should fetch user preferences for guild', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				query: { guildId: 'guild-1' },
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					findMany: jest.fn().mockResolvedValue([mockPreference]),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 3)

			await handler(req, res)

			expect(mockDb.userArtistPreference.findMany).toHaveBeenCalledWith({
				where: { discordUserId: 'discord-123', guildId: 'guild-1' },
				orderBy: { createdAt: 'desc' },
			})
			expect(res.json).toHaveBeenCalledWith({
				preferences: [mockPreference],
			})
		})

		test('should return 401 when not authenticated', async () => {
			const req = createMockRequest({
				user: undefined,
				query: { guildId: 'guild-1' },
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 3)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(401)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Not authenticated',
			})
		})

		test('should return 500 on database error', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				query: { guildId: 'guild-1' },
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					findMany: jest
						.fn()
						.mockRejectedValue(new Error('Database error')),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.get as jest.Mock, 3)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Failed to get preferences',
			})
		})
	})

	describe('POST /api/users/me/preferred-artists', () => {
		test('should save artist preference', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: 'guild-1',
					artistKey: 'drake',
					artistName: 'Drake',
					spotifyId: 'spotify-1',
					imageUrl: 'https://example.com/image.jpg',
					preference: 'prefer',
				},
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					upsert: jest.fn().mockResolvedValue(mockPreference),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.post as jest.Mock, 0)

			await handler(req, res)

			expect(mockDb.userArtistPreference.upsert).toHaveBeenCalled()
			expect(res.json).toHaveBeenCalledWith({
				preference: mockPreference,
			})
		})

		test('should return 400 on invalid request body', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: '',
					artistKey: '',
				},
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.post as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.any(String),
				}),
			)
		})

		test('should return 401 when not authenticated', async () => {
			const req = createMockRequest({
				user: undefined,
				body: {
					guildId: 'guild-1',
					artistKey: 'drake',
					artistName: 'Drake',
				},
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.post as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(401)
		})

		test('should return 500 on database error', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: 'guild-1',
					artistKey: 'drake',
					artistName: 'Drake',
					spotifyId: 'spotify-1',
					preference: 'prefer',
				},
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					upsert: jest
						.fn()
						.mockRejectedValue(new Error('Database error')),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.post as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(500)
		})
	})

	describe('PUT /api/artists/preferences/batch', () => {
		test('should save multiple artist preferences', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: 'guild-1',
					items: [
						{
							artistId: 'spotify-1',
							artistKey: 'drake',
							artistName: 'Drake',
							imageUrl: 'https://example.com/image.jpg',
							preference: 'prefer',
						},
						{
							artistId: 'spotify-2',
							artistKey: 'weeknd',
							artistName: 'The Weeknd',
							imageUrl: 'https://example.com/weeknd.jpg',
							preference: 'block',
						},
					],
				},
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					upsert: jest.fn().mockResolvedValue(mockPreference),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.put as jest.Mock, 0)

			await handler(req, res)

			expect(mockDb.userArtistPreference.upsert).toHaveBeenCalledTimes(2)
			expect(res.json).toHaveBeenCalledWith({
				preferences: expect.any(Array),
			})
		})

		test('should handle empty items array', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: 'guild-1',
					items: [],
				},
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					upsert: jest.fn(),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.put as jest.Mock, 0)

			await handler(req, res)

			expect(mockDb.userArtistPreference.upsert).toHaveBeenCalledTimes(0)
			expect(res.json).toHaveBeenCalledWith({
				preferences: [],
			})
		})

		test('should return 400 on invalid request body', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: '',
					items: [{ artistId: '' }],
				},
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.put as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.any(String),
				}),
			)
		})

		test('should return 401 when not authenticated', async () => {
			const req = createMockRequest({
				user: undefined,
				body: {
					guildId: 'guild-1',
					items: [
						{
							artistId: 'spotify-1',
							artistKey: 'drake',
							artistName: 'Drake',
							imageUrl: null,
							preference: 'prefer',
						},
					],
				},
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.put as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(401)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Not authenticated',
			})
		})

		test('should return 500 on database error', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				body: {
					guildId: 'guild-1',
					items: [
						{
							artistId: 'spotify-1',
							artistKey: 'drake',
							artistName: 'Drake',
							imageUrl: 'https://example.com/image.jpg',
							preference: 'prefer',
						},
					],
				},
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					upsert: jest
						.fn()
						.mockRejectedValue(new Error('Database error')),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.put as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Failed to save preferences',
			})
		})
	})

	describe('DELETE /api/users/me/preferred-artists/:artistKey', () => {
		test('should delete artist preference', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				params: { artistKey: 'drake' },
				query: { guildId: 'guild-1' },
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					delete: jest.fn().mockResolvedValue(mockPreference),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.delete as jest.Mock, 0)

			await handler(req, res)

			expect(mockDb.userArtistPreference.delete).toHaveBeenCalled()
			expect(res.json).toHaveBeenCalledWith({ success: true })
		})

		test('should return 400 when guildId missing', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				params: { artistKey: 'drake' },
				query: {},
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.delete as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Missing guildId query param',
			})
		})

		test('should return 401 when not authenticated', async () => {
			const req = createMockRequest({
				user: undefined,
				params: { artistKey: 'drake' },
				query: { guildId: 'guild-1' },
			}) as any
			const res = createMockResponse()

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.delete as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(401)
		})

		test('should return 500 on database error', async () => {
			const req = createMockRequest({
				user: { id: 'discord-123' },
				params: { artistKey: 'drake' },
				query: { guildId: 'guild-1' },
			}) as any
			const res = createMockResponse()

			const mockDb = {
				userArtistPreference: {
					delete: jest
						.fn()
						.mockRejectedValue(new Error('Database error')),
				},
			}
			;(getPrismaClient as jest.Mock).mockReturnValue(mockDb)

			setupArtistsRoutes(mockApp)
			const handler = getRouteHandler(mockApp.delete as jest.Mock, 0)

			await handler(req, res)

			expect(res.status).toHaveBeenCalledWith(500)
		})
	})
})
