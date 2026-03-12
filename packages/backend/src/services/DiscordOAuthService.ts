import { errorLog, debugLog } from '@lucky/shared/utils'

export interface DiscordUser {
    id: string
    username: string
    discriminator: string
    global_name?: string | null
    avatar: string | null
    email?: string
    verified?: boolean
}

export interface DiscordGuild {
    id: string
    name: string
    icon: string | null
    owner: boolean
    permissions: string
    permissions_new?: string
    features: string[]
}

export class DiscordApiError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly endpoint: string,
    ) {
        super(message)
        this.name = 'DiscordApiError'
    }
}

interface TokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token: string
    scope: string
}

class DiscordOAuthService {
    private readonly apiBaseUrl = 'https://discord.com/api/v10'

    private normalizePermissionValue(value: unknown): string | null {
        if (typeof value === 'string') {
            const normalized = value.trim()
            return normalized.length > 0 ? normalized : null
        }

        if (
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= 0 &&
            Number.isInteger(value)
        ) {
            return String(value)
        }

        return null
    }

    private parsePermissionBits(
        permissions: string | null | undefined,
    ): bigint | null {
        const normalized = this.normalizePermissionValue(permissions)
        if (!normalized) {
            return null
        }

        try {
            return BigInt(normalized)
        } catch {
            return null
        }
    }

    private normalizeGuildPayload(payload: unknown): DiscordGuild[] {
        if (!Array.isArray(payload)) {
            return []
        }

        const guilds: DiscordGuild[] = []

        for (const rawGuild of payload) {
            if (typeof rawGuild !== 'object' || rawGuild === null) {
                continue
            }

            const guild = rawGuild as Record<string, unknown>
            if (typeof guild.id !== 'string' || typeof guild.name !== 'string') {
                continue
            }

            const permissions = this.normalizePermissionValue(guild.permissions)
            const permissionsNew = this.normalizePermissionValue(
                guild.permissions_new,
            )

            guilds.push({
                id: guild.id,
                name: guild.name,
                icon: typeof guild.icon === 'string' ? guild.icon : null,
                owner: guild.owner === true,
                permissions: permissions ?? permissionsNew ?? '0',
                permissions_new: permissionsNew ?? undefined,
                features: Array.isArray(guild.features)
                    ? guild.features.filter(
                          (feature): feature is string =>
                              typeof feature === 'string',
                      )
                    : [],
            })
        }

        return guilds
    }

    private getClientId(): string {
        const clientId = process.env.CLIENT_ID
        if (!clientId) {
            throw new Error('CLIENT_ID is not configured')
        }
        return clientId
    }

    private getClientSecret(): string {
        const clientSecret = process.env.CLIENT_SECRET
        if (!clientSecret) {
            throw new Error('CLIENT_SECRET is not configured')
        }
        return clientSecret
    }

    private getRedirectUri(): string {
        return (
            process.env.WEBAPP_REDIRECT_URI ??
            'http://localhost:3000/api/auth/callback'
        )
    }

    async exchangeCodeForToken(
        code: string,
        redirectUri?: string,
    ): Promise<TokenResponse> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.getClientId(),
                    client_secret: this.getClientSecret(),
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri ?? this.getRedirectUri(),
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new DiscordApiError(
                    `Token exchange failed: ${response.status} ${errorText}`,
                    response.status,
                    '/oauth2/token',
                )
            }

            const tokenData = (await response.json()) as TokenResponse
            debugLog({ message: 'Successfully exchanged code for token' })
            return tokenData
        } catch (error) {
            errorLog({ message: 'Error exchanging code for token:', error })
            throw error
        }
    }

    async getUserInfo(accessToken: string): Promise<DiscordUser> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/users/@me`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new DiscordApiError(
                    `Failed to fetch user info: ${response.status} ${errorText}`,
                    response.status,
                    '/users/@me',
                )
            }

            const userData = (await response.json()) as DiscordUser
            debugLog({
                message: 'Successfully fetched user info',
                data: { userId: userData.id },
            })
            return userData
        } catch (error) {
            errorLog({ message: 'Error fetching user info:', error })
            throw error
        }
    }

    async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/users/@me/guilds`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            )

            if (!response.ok) {
                const errorText = await response.text()
                throw new DiscordApiError(
                    `Failed to fetch user guilds: ${response.status} ${errorText}`,
                    response.status,
                    '/users/@me/guilds',
                )
            }

            const guilds = this.normalizeGuildPayload(await response.json())
            debugLog({
                message: 'Successfully fetched user guilds',
                data: { count: guilds.length },
            })
            return guilds
        } catch (error) {
            errorLog({ message: 'Error fetching user guilds:', error })
            throw error
        }
    }

    hasAdminPermission(
        permissions: string | null | undefined,
        permissionsNew?: string | null,
    ): boolean {
        const permissionsBigInt =
            this.parsePermissionBits(permissionsNew) ??
            this.parsePermissionBits(permissions)

        if (permissionsBigInt === null) {
            return false
        }

        const administratorPermission = BigInt(0x8)
        const manageGuildPermission = BigInt(0x20)

        return (
            (permissionsBigInt & administratorPermission) ===
                administratorPermission ||
            (permissionsBigInt & manageGuildPermission) ===
                manageGuildPermission
        )
    }

    filterAdminGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
        return guilds.filter((guild) =>
            this.hasAdminPermission(guild.permissions, guild.permissions_new),
        )
    }

    async refreshToken(refreshToken: string): Promise<TokenResponse> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.getClientId(),
                    client_secret: this.getClientSecret(),
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new DiscordApiError(
                    `Token refresh failed: ${response.status} ${errorText}`,
                    response.status,
                    '/oauth2/token',
                )
            }

            const tokenData = (await response.json()) as TokenResponse
            debugLog({ message: 'Successfully refreshed token' })
            return tokenData
        } catch (error) {
            errorLog({ message: 'Error refreshing token:', error })
            throw error
        }
    }
}

export const discordOAuthService = new DiscordOAuthService()
