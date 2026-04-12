import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'

export type SpotifyLinkRow = {
    spotifyId: string
    accessToken: string
    refreshToken: string
    tokenExpiresAt: Date
    spotifyUsername: string | null
}

export class SpotifyLinkService {
    async getByDiscordId(discordId: string): Promise<SpotifyLinkRow | null> {
        try {
            const prisma = getPrismaClient()
            const row = await prisma.spotifyLink.findUnique({
                where: { discordId },
            })
            return row
                ? {
                      spotifyId: row.spotifyId,
                      accessToken: row.accessToken,
                      refreshToken: row.refreshToken,
                      tokenExpiresAt: row.tokenExpiresAt,
                      spotifyUsername: row.spotifyUsername,
                  }
                : null
        } catch (error) {
            errorLog({
                message: 'Failed to get Spotify link',
                error,
                data: { discordId },
            })
            return null
        }
    }

    async getValidAccessToken(discordId: string): Promise<string | null> {
        const row = await this.getByDiscordId(discordId)
        if (!row) return null

        const now = new Date()
        if (row.tokenExpiresAt > now) {
            return row.accessToken
        }

        return await this.refreshAccessToken(discordId, row.refreshToken)
    }

    private async refreshAccessToken(
        discordId: string,
        refreshToken: string,
    ): Promise<string | null> {
        try {
            const clientId = process.env.SPOTIFY_CLIENT_ID
            const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
            if (!clientId || !clientSecret) {
                errorLog({
                    message: 'Spotify credentials not configured',
                })
                return null
            }

            const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }).toString(),
            })

            if (!res.ok) {
                errorLog({
                    message: 'Failed to refresh Spotify token',
                    data: { discordId, status: res.status },
                })
                return null
            }

            const data = (await res.json().catch(() => null)) as {
                access_token?: string
                expires_in?: number
                refresh_token?: string
                error?: string
            }

            if (data?.error || !data?.access_token) {
                errorLog({
                    message: 'Invalid refresh token response',
                    data: { discordId, error: data?.error },
                })
                return null
            }

            const newAccessToken = data.access_token
            const newRefreshToken = data.refresh_token ?? refreshToken
            const expiresIn = data.expires_in ?? 3600
            const newExpiresAt = new Date(Date.now() + expiresIn * 1000)

            const prisma = getPrismaClient()
            await prisma.spotifyLink.update({
                where: { discordId },
                data: {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    tokenExpiresAt: newExpiresAt,
                },
            })

            debugLog({
                message: 'Spotify token refreshed',
                data: { discordId },
            })

            return newAccessToken
        } catch (error) {
            errorLog({
                message: 'Error refreshing Spotify token',
                error,
                data: { discordId },
            })
            return null
        }
    }

    async set(data: {
        discordId: string
        spotifyId: string
        accessToken: string
        refreshToken: string
        tokenExpiresAt: Date
        spotifyUsername?: string | null
    }): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.spotifyLink.upsert({
                where: { discordId: data.discordId },
                create: {
                    discordId: data.discordId,
                    spotifyId: data.spotifyId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    tokenExpiresAt: data.tokenExpiresAt,
                    ...(data.spotifyUsername != null &&
                        data.spotifyUsername !== '' && {
                            spotifyUsername: data.spotifyUsername,
                        }),
                },
                update: {
                    spotifyId: data.spotifyId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    tokenExpiresAt: data.tokenExpiresAt,
                    spotifyUsername: data.spotifyUsername ?? null,
                },
            })
            debugLog({
                message: 'Spotify link saved',
                data: {
                    discordId: data.discordId,
                    spotifyUsername: data.spotifyUsername ?? undefined,
                },
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to set Spotify link',
                error,
                data: { discordId: data.discordId },
            })
            return false
        }
    }

    async unlink(discordId: string): Promise<boolean> {
        try {
            const prisma = getPrismaClient()
            await prisma.spotifyLink.delete({ where: { discordId } })
            debugLog({
                message: 'Spotify link removed',
                data: { discordId },
            })
            return true
        } catch (error) {
            const code =
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                typeof (error as { code?: unknown }).code === 'string'
                    ? (error as { code: string }).code
                    : null

            if (code === 'P2025') {
                debugLog({
                    message: 'Spotify link already absent',
                    data: { discordId },
                })
                return true
            }

            errorLog({
                message: 'Failed to unlink Spotify',
                error,
                data: { discordId },
            })
            return false
        }
    }
}

export const spotifyLinkService = new SpotifyLinkService()
