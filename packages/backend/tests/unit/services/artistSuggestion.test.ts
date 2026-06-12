import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import type { SpotifyArtist } from '@lucky/shared/utils'
import { ArtistSuggestionService } from '../../../src/services/artistSuggestion'
import {
    isSpotifyAuthConfigured,
    getSpotifyClientToken,
} from '../../../src/services/SpotifyAuthService'
import { spotifyLinkService } from '@lucky/shared/services'
import { getPrismaClient, errorLog } from '@lucky/shared/utils'

jest.mock('../../../src/services/SpotifyAuthService')
jest.mock('@lucky/shared/services')
jest.mock('@lucky/shared/utils', () => {
    const actual = jest.requireActual('@lucky/shared/utils')
    return {
        ...actual,
        getPrismaClient: jest.fn(),
        searchSpotifyArtists: jest.fn(),
        getSpotifyRelatedArtists: jest.fn(),
        errorLog: jest.fn(),
        warnLog: jest.fn(),
        debugLog: jest.fn(),
    }
})

describe('ArtistSuggestionService', () => {
    let service: ArtistSuggestionService
    let mockPrisma: any

    const mockSpotifyArtist: SpotifyArtist = {
        id: 'artist_1',
        name: 'Test Artist',
        imageUrl: 'https://example.com/image.jpg',
        popularity: 75,
        genres: ['pop', 'rock'],
    }

    beforeEach(() => {
        jest.clearAllMocks()

        mockPrisma = {
            userArtistPreference: {
                findMany: jest.fn(),
                upsert: jest.fn(),
                delete: jest.fn(),
            },
        }
        ;(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma)
        ;(spotifyLinkService as any) = {
            getValidAccessToken: jest.fn(),
        }
        ;(errorLog as jest.Mock).mockImplementation(() => {})

        service = new ArtistSuggestionService({
            maxSuggestions: 10,
            fallbackCacheTtlSeconds: 60,
            userTopArtistsCacheTtlSeconds: 15,
        })
    })

    describe('getSuggestions', () => {
        test('should return preferred artists when cache misses on top artists', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)

            const mockPref = {
                spotifyId: 'pref_artist_1',
                artistKey: 'testartist',
                artistName: 'Test Artist',
                imageUrl: 'https://example.com/pref.jpg',
            }

            mockPrisma.userArtistPreference.findMany.mockResolvedValue([
                mockPref,
            ])
            ;(
                spotifyLinkService.getValidAccessToken as jest.Mock
            ).mockResolvedValue(null)

            const suggestions = await service.getSuggestions('user_123')

            expect(suggestions).toContainEqual(
                expect.objectContaining({
                    id: 'pref_artist_1',
                    name: 'Test Artist',
                }),
            )
        })

        test('should throw when Spotify is not configured', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(false)

            await expect(service.getSuggestions('user_123')).rejects.toThrow(
                'Spotify not configured',
            )
        })

        test('should load Spotify top artists when not yet cached', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            mockPrisma.userArtistPreference.findMany.mockResolvedValue([])
            ;(
                spotifyLinkService.getValidAccessToken as jest.Mock
            ).mockResolvedValue('token_123')

            const originalFetch = global.fetch
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [{ id: 'artist_1', name: 'Test Artist' }],
                }),
            }) as unknown as typeof fetch

            try {
                const suggestions = await service.getSuggestions('user_123')
                expect(suggestions).toContainEqual(
                    expect.objectContaining({ id: 'artist_1' }),
                )
            } finally {
                global.fetch = originalFetch
            }
        })

        test('should respect maxSuggestions limit', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)

            const manyPrefs = Array.from({ length: 15 }, (_, i) => ({
                spotifyId: `artist_${i}`,
                artistKey: `artist${i}`,
                artistName: `Artist ${i}`,
                imageUrl: null,
            }))

            mockPrisma.userArtistPreference.findMany.mockResolvedValue(
                manyPrefs,
            )
            ;(
                spotifyLinkService.getValidAccessToken as jest.Mock
            ).mockResolvedValue(null)

            const suggestions = await service.getSuggestions('user_123')

            expect(suggestions.length).toBeLessThanOrEqual(10)
        })
    })

    describe('handleGetSuggestions', () => {
        test('should throw 401 when discordUserId is missing', async () => {
            const error = await service
                .handleGetSuggestions(undefined)
                .catch((e) => e)

            expect(error.status).toBe(401)
            expect(error.error).toBe('Not authenticated')
        })

        test('should throw 503 when Spotify not configured', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(false)

            const error = await service
                .handleGetSuggestions('user_123')
                .catch((e) => e)

            expect(error.status).toBe(503)
        })

        test('should throw 503 when suggestions are empty', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            mockPrisma.userArtistPreference.findMany.mockResolvedValue([])
            ;(
                spotifyLinkService.getValidAccessToken as jest.Mock
            ).mockResolvedValue(null)

            const { searchSpotifyArtists } = await import('@lucky/shared/utils')
            ;(searchSpotifyArtists as jest.Mock).mockResolvedValue([])
            ;(getSpotifyClientToken as jest.Mock).mockResolvedValue(null)

            const error = await service
                .handleGetSuggestions('user_123')
                .catch((e) => e)

            expect(error.status).toBe(503)
            expect(error.error).toMatch(/temporarily unavailable/)
        })

        test('should return suggestions when all conditions met', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)

            const mockPref = {
                spotifyId: 'artist_1',
                artistKey: 'testartist',
                artistName: 'Test Artist',
                imageUrl: null,
            }

            mockPrisma.userArtistPreference.findMany.mockResolvedValue([
                mockPref,
            ])
            ;(
                spotifyLinkService.getValidAccessToken as jest.Mock
            ).mockResolvedValue(null)

            const suggestions = await service.handleGetSuggestions('user_123')

            expect(suggestions).toHaveLength(1)
            expect(suggestions[0]).toMatchObject({ id: 'artist_1' })
        })
    })

    describe('handleSearchArtists', () => {
        test('should throw 400 when query is empty', async () => {
            const error = await service.handleSearchArtists('').catch((e) => e)

            expect(error.status).toBe(400)
            expect(error.error).toMatch(/Missing query/)
        })

        test('should throw 503 when Spotify not configured', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(false)

            const error = await service
                .handleSearchArtists('test')
                .catch((e) => e)

            expect(error.status).toBe(503)
        })

        test('should throw 503 when Spotify token unavailable', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            ;(getSpotifyClientToken as jest.Mock).mockResolvedValue(null)

            const error = await service
                .handleSearchArtists('test')
                .catch((e) => e)

            expect(error.status).toBe(503)
        })

        test('should return search results', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            ;(getSpotifyClientToken as jest.Mock).mockResolvedValue('token_123')

            const { searchSpotifyArtists } = await import('@lucky/shared/utils')
            ;(searchSpotifyArtists as jest.Mock).mockResolvedValue([
                mockSpotifyArtist,
            ])

            const results = await service.handleSearchArtists('test')

            expect(results).toEqual([mockSpotifyArtist])
            expect(searchSpotifyArtists).toHaveBeenCalledWith(
                'token_123',
                'test',
                12,
            )
        })
    })

    describe('handleGetRelatedArtists', () => {
        test('should throw 400 when artistId is missing', async () => {
            const error = await service
                .handleGetRelatedArtists(undefined)
                .catch((e) => e)

            expect(error.status).toBe(400)
            expect(error.error).toMatch(/Missing artistId/)
        })

        test('should throw 503 when Spotify not configured', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(false)

            const error = await service
                .handleGetRelatedArtists('artist_1')
                .catch((e) => e)

            expect(error.status).toBe(503)
        })

        test('should return related artists', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            ;(getSpotifyClientToken as jest.Mock).mockResolvedValue('token_123')

            const { getSpotifyRelatedArtists } =
                await import('@lucky/shared/utils')
            ;(getSpotifyRelatedArtists as jest.Mock).mockResolvedValue([
                mockSpotifyArtist,
            ])

            const results = await service.handleGetRelatedArtists('artist_1')

            expect(results).toEqual([mockSpotifyArtist])
            expect(getSpotifyRelatedArtists).toHaveBeenCalledWith(
                'token_123',
                'artist_1',
            )
        })
    })

    describe('handleGetPreferredArtists', () => {
        test('should throw 401 when discordUserId is missing', async () => {
            const error = await service
                .handleGetPreferredArtists(undefined, undefined)
                .catch((e) => e)

            expect(error.status).toBe(401)
            expect(error.error).toBe('Not authenticated')
        })

        test('should return preferences without guildId filter', async () => {
            mockPrisma.userArtistPreference.findMany.mockResolvedValue([
                { artistKey: 'artist1', preference: 'prefer' },
            ])

            const results = await service.handleGetPreferredArtists(
                'user_123',
                undefined,
            )

            expect(results).toHaveLength(1)
            expect(
                mockPrisma.userArtistPreference.findMany,
            ).toHaveBeenCalledWith({
                where: { discordUserId: 'user_123' },
                orderBy: { createdAt: 'desc' },
            })
        })

        test('should filter by guildId when provided', async () => {
            mockPrisma.userArtistPreference.findMany.mockResolvedValue([])

            await service.handleGetPreferredArtists('user_123', 'guild_456')

            expect(
                mockPrisma.userArtistPreference.findMany,
            ).toHaveBeenCalledWith({
                where: { discordUserId: 'user_123', guildId: 'guild_456' },
                orderBy: { createdAt: 'desc' },
            })
        })
    })

    describe('handleSavePreferredArtist', () => {
        test('should throw 401 when discordUserId is missing', async () => {
            const error = await service
                .handleSavePreferredArtist(undefined, {})
                .catch((e) => e)

            expect(error.status).toBe(401)
        })

        test('should throw 400 on invalid body', async () => {
            const error = await service
                .handleSavePreferredArtist('user_123', { guildId: 'guild_1' })
                .catch((e) => e)

            expect(error.status).toBe(400)
            expect(typeof error.error).toBe('string')
        })

        test('should upsert preference', async () => {
            mockPrisma.userArtistPreference.upsert.mockResolvedValue({
                discordUserId: 'user_123',
                guildId: 'guild_1',
                artistKey: 'testartist',
                artistName: 'Test Artist',
                preference: 'prefer',
            })

            await service.handleSavePreferredArtist('user_123', {
                guildId: 'guild_1',
                artistKey: 'Test Artist',
                artistName: 'Test Artist',
                preference: 'prefer',
            })

            expect(mockPrisma.userArtistPreference.upsert).toHaveBeenCalled()
        })
    })

    describe('handleBatchSavePreferences', () => {
        test('should throw 401 when discordUserId is missing', async () => {
            const error = await service
                .handleBatchSavePreferences(undefined, {
                    guildId: 'g1',
                    items: [],
                })
                .catch((e) => e)

            expect(error.status).toBe(401)
        })

        test('should throw 400 on invalid body', async () => {
            const error = await service
                .handleBatchSavePreferences('user_123', { items: [] })
                .catch((e) => e)

            expect(error.status).toBe(400)
        })

        test('should batch upsert preferences', async () => {
            mockPrisma.userArtistPreference.upsert.mockResolvedValue({
                discordUserId: 'user_123',
            })

            await service.handleBatchSavePreferences('user_123', {
                guildId: 'guild_1',
                items: [
                    {
                        artistId: 'artist_1',
                        artistKey: 'artist1',
                        artistName: 'Artist 1',
                        imageUrl: null,
                        preference: 'prefer',
                    },
                ],
            })

            expect(mockPrisma.userArtistPreference.upsert).toHaveBeenCalled()
        })
    })

    describe('handleDeletePreferredArtist', () => {
        test('should throw 401 when discordUserId is missing', async () => {
            const error = await service
                .handleDeletePreferredArtist(undefined, 'key', 'guild')
                .catch((e) => e)

            expect(error.status).toBe(401)
        })

        test('should throw 400 when artistKey is missing', async () => {
            const error = await service
                .handleDeletePreferredArtist('user_123', undefined, 'guild')
                .catch((e) => e)

            expect(error.status).toBe(400)
            expect(error.error).toMatch(/Missing artistKey/)
        })

        test('should throw 400 when guildId is missing', async () => {
            const error = await service
                .handleDeletePreferredArtist('user_123', 'key', undefined)
                .catch((e) => e)

            expect(error.status).toBe(400)
            expect(error.error).toMatch(/Missing guildId/)
        })

        test('should delete preference', async () => {
            mockPrisma.userArtistPreference.delete.mockResolvedValue({})

            await service.handleDeletePreferredArtist(
                'user_123',
                'testartist',
                'guild_1',
            )

            expect(mockPrisma.userArtistPreference.delete).toHaveBeenCalledWith(
                {
                    where: {
                        discordUserId_guildId_artistKey: {
                            discordUserId: 'user_123',
                            guildId: 'guild_1',
                            artistKey: 'testartist',
                        },
                    },
                },
            )
        })
    })

    describe('prewarmCache', () => {
        test('should skip when Spotify not configured', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(false)

            await service.prewarmCache()

            expect(isSpotifyAuthConfigured).toHaveBeenCalled()
        })

        test('should not refetch once the in-memory fallback cache is warm', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            ;(getSpotifyClientToken as jest.Mock).mockResolvedValue('token_123')

            const { searchSpotifyArtists } = await import('@lucky/shared/utils')
            ;(searchSpotifyArtists as jest.Mock).mockResolvedValue([
                mockSpotifyArtist,
            ])

            await service.prewarmCache()
            const callsAfterWarm = (searchSpotifyArtists as jest.Mock).mock
                .calls.length
            expect(callsAfterWarm).toBeGreaterThan(0)

            // Second prewarm finds the cache warm and performs no Spotify search.
            await service.prewarmCache()
            expect((searchSpotifyArtists as jest.Mock).mock.calls.length).toBe(
                callsAfterWarm,
            )
        })
    })

    describe('cache behavior', () => {
        test('caches user top artists in-memory and skips refetch on repeat calls', async () => {
            ;(isSpotifyAuthConfigured as jest.Mock).mockReturnValue(true)
            mockPrisma.userArtistPreference.findMany.mockResolvedValue([])
            ;(
                spotifyLinkService.getValidAccessToken as jest.Mock
            ).mockResolvedValue('token_123')

            const originalFetch = global.fetch
            const fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            id: 'artist_1',
                            name: 'Artist 1',
                            popularity: 75,
                            genres: [],
                            images: [{ url: 'https://example.com/image.jpg' }],
                        },
                    ],
                }),
            })
            global.fetch = fetch as unknown as typeof global.fetch

            try {
                await service.getSuggestions('user_123')
                // First load fetches the three Spotify time-range pages.
                const callsAfterFirst = fetch.mock.calls.length
                expect(callsAfterFirst).toBeGreaterThan(0)

                // Second load is served from the in-memory cache — no new fetch.
                const second = await service.getSuggestions('user_123')
                expect(fetch.mock.calls.length).toBe(callsAfterFirst)
                expect(second).toContainEqual(
                    expect.objectContaining({ id: 'artist_1' }),
                )
            } finally {
                global.fetch = originalFetch
            }
        })

        test('returns partial results when one time_range times out', async () => {
            const mockArtist = {
                id: 'artist_1',
                name: 'Test Artist',
                images: [{ url: 'https://example.com/image.jpg' }],
                popularity: 75,
                genres: ['pop'],
            }

            const originalFetch = global.fetch
            const fetch = jest.fn()
            const timeoutError = new DOMException('Timeout', 'AbortError')
            Object.defineProperty(timeoutError, 'name', {
                value: 'TimeoutError',
                writable: false,
            })

            // First call (short_term): success
            // Second call (medium_term): timeout
            // Third call (long_term): success
            let callCount = 0
            fetch.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    // short_term success
                    return {
                        ok: true,
                        json: async () => ({ items: [mockArtist] }),
                    }
                } else if (callCount === 2) {
                    // medium_term timeout
                    throw timeoutError
                } else {
                    // long_term success
                    return {
                        ok: true,
                        json: async () => ({
                            items: [{ ...mockArtist, id: 'artist_2', name: 'Another Artist' }],
                        }),
                    }
                }
            })
            global.fetch = fetch as unknown as typeof global.fetch

            try {
                ;(spotifyLinkService as any).getValidAccessToken = jest.fn().mockResolvedValue('test-token')
                const suggestions = await service.getSuggestions('user_123')

                // Should have results from short_term and long_term, skipping the timed-out medium_term
                expect(suggestions.length).toBe(2)
                expect(suggestions).toContainEqual(
                    expect.objectContaining({ id: 'artist_1' }),
                )
                expect(suggestions).toContainEqual(
                    expect.objectContaining({ id: 'artist_2' }),
                )

                // warnLog should be called for the timeout
                const { warnLog } = await import('@lucky/shared/utils')
                expect(warnLog).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: expect.stringContaining('timed out'),
                    }),
                )
            } finally {
                global.fetch = originalFetch
            }
        })
    })
})
