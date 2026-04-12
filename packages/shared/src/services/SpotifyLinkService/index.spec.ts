import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { spotifyLinkService } from './index'

const mockPrismaClient = {
    spotifyLink: {
        findUnique: jest.fn() as any,
        upsert: jest.fn() as any,
        update: jest.fn() as any,
        delete: jest.fn() as any,
    },
}

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrismaClient,
}))

jest.mock('../../utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

describe('SpotifyLinkService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getByDiscordId', () => {
        it('returns link when found', async () => {
            const mockLink = {
                spotifyId: 'spotify-123',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                tokenExpiresAt: new Date(),
                spotifyUsername: 'test-user',
            }
            mockPrismaClient.spotifyLink.findUnique.mockResolvedValue(mockLink)

            const result = await spotifyLinkService.getByDiscordId('discord-123')

            expect(result).toEqual(mockLink)
            expect(mockPrismaClient.spotifyLink.findUnique).toHaveBeenCalledWith({
                where: { discordId: 'discord-123' },
            })
        })

        it('returns null when not found', async () => {
            mockPrismaClient.spotifyLink.findUnique.mockResolvedValue(null)

            const result = await spotifyLinkService.getByDiscordId('discord-123')

            expect(result).toBeNull()
        })

        it('returns null on error', async () => {
            mockPrismaClient.spotifyLink.findUnique.mockRejectedValue(new Error('DB error'))

            const result = await spotifyLinkService.getByDiscordId('discord-123')

            expect(result).toBeNull()
        })
    })

    describe('getValidAccessToken', () => {
        it('returns token when valid', async () => {
            const futureDate = new Date(Date.now() + 3600000)
            mockPrismaClient.spotifyLink.findUnique.mockResolvedValue({
                spotifyId: 'spotify-123',
                accessToken: 'valid-token',
                refreshToken: 'refresh-token',
                tokenExpiresAt: futureDate,
                spotifyUsername: 'test-user',
            })

            const result = await spotifyLinkService.getValidAccessToken('discord-123')

            expect(result).toBe('valid-token')
        })

        it('returns null when link not found', async () => {
            mockPrismaClient.spotifyLink.findUnique.mockResolvedValue(null)

            const result = await spotifyLinkService.getValidAccessToken('discord-123')

            expect(result).toBeNull()
        })

        it('refreshes token when expired', async () => {
            const pastDate = new Date(Date.now() - 3600000)
            mockPrismaClient.spotifyLink.findUnique.mockResolvedValue({
                spotifyId: 'spotify-123',
                accessToken: 'expired-token',
                refreshToken: 'refresh-token',
                tokenExpiresAt: pastDate,
                spotifyUsername: 'test-user',
            } as any)

            process.env.SPOTIFY_CLIENT_ID = 'test-client-id'
            process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret'

            const mockFetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: async () => ({
                        access_token: 'new-token',
                        expires_in: 3600,
                        refresh_token: 'refresh-token',
                    }),
                } as any),
            )
            ;(global as any).fetch = mockFetch

            const result = await spotifyLinkService.getValidAccessToken('discord-123')

            expect(result).toBe('new-token')
            expect(mockPrismaClient.spotifyLink.update).toHaveBeenCalled()
        })
    })

    describe('set', () => {
        it('creates new link', async () => {
            const expiresAt = new Date(Date.now() + 3600000)
            mockPrismaClient.spotifyLink.upsert.mockResolvedValue({} as any)

            const result = await spotifyLinkService.set({
                discordId: 'discord-123',
                spotifyId: 'spotify-123',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                tokenExpiresAt: expiresAt,
                spotifyUsername: 'test-user',
            })

            expect(result).toBe(true)
            expect(mockPrismaClient.spotifyLink.upsert).toHaveBeenCalled()
        })

        it('returns false on error', async () => {
            mockPrismaClient.spotifyLink.upsert.mockRejectedValue(new Error('DB error') as any)

            const result = await spotifyLinkService.set({
                discordId: 'discord-123',
                spotifyId: 'spotify-123',
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                tokenExpiresAt: new Date(),
            })

            expect(result).toBe(false)
        })
    })

    describe('unlink', () => {
        it('deletes link', async () => {
            mockPrismaClient.spotifyLink.delete.mockResolvedValue({} as any)

            const result = await spotifyLinkService.unlink('discord-123')

            expect(result).toBe(true)
            expect(mockPrismaClient.spotifyLink.delete).toHaveBeenCalledWith({
                where: { discordId: 'discord-123' },
            })
        })

        it('returns true when link already absent (idempotent)', async () => {
            const error = new Error('Not found')
            ;(error as any).code = 'P2025'
            mockPrismaClient.spotifyLink.delete.mockRejectedValue(error as any)

            const result = await spotifyLinkService.unlink('discord-123')

            expect(result).toBe(true)
        })

        it('returns false on other error', async () => {
            mockPrismaClient.spotifyLink.delete.mockRejectedValue(new Error('DB error') as any)

            const result = await spotifyLinkService.unlink('discord-123')

            expect(result).toBe(false)
        })
    })
})
