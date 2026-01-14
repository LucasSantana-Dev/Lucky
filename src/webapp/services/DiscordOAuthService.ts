import { errorLog, debugLog } from '../../utils/general/log'

export interface DiscordUser {
    id: string
    username: string
    discriminator: string
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
    features: string[]
}

interface TokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token: string
    scope: string
}

class DiscordOAuthService {
    private readonly clientId: string
    private readonly clientSecret: string
    private readonly redirectUri: string
    private readonly apiBaseUrl = 'https://discord.com/api/v10'

    constructor() {
        this.clientId = process.env.CLIENT_ID ?? ''
        this.clientSecret = process.env.CLIENT_SECRET ?? ''
        this.redirectUri = process.env.WEBAPP_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback'

        if (!this.clientId || !this.clientSecret) {
            errorLog({
                message: 'Discord OAuth credentials not configured. CLIENT_ID and CLIENT_SECRET are required.',
            })
        }
    }

    async exchangeCodeForToken(code: string): Promise<TokenResponse> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: this.redirectUri,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
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
                throw new Error(`Failed to fetch user info: ${response.status} ${errorText}`)
            }

            const userData = (await response.json()) as DiscordUser
            debugLog({ message: 'Successfully fetched user info', data: { userId: userData.id } })
            return userData
        } catch (error) {
            errorLog({ message: 'Error fetching user info:', error })
            throw error
        }
    }

    async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/users/@me/guilds`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Failed to fetch user guilds: ${response.status} ${errorText}`)
            }

            const guilds = (await response.json()) as DiscordGuild[]
            debugLog({ message: 'Successfully fetched user guilds', data: { count: guilds.length } })
            return guilds
        } catch (error) {
            errorLog({ message: 'Error fetching user guilds:', error })
            throw error
        }
    }

    hasAdminPermission(permissions: string): boolean {
        const permissionsBigInt = BigInt(permissions)
        const administratorPermission = BigInt(0x8)
        const manageGuildPermission = BigInt(0x20)

        return (
            (permissionsBigInt & administratorPermission) === administratorPermission ||
            (permissionsBigInt & manageGuildPermission) === manageGuildPermission
        )
    }

    filterAdminGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
        return guilds.filter((guild) => this.hasAdminPermission(guild.permissions))
    }

    async refreshToken(refreshToken: string): Promise<TokenResponse> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
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
