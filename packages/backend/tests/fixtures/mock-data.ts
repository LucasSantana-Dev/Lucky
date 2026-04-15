import type {
    DiscordUser,
    DiscordGuild,
} from '../../src/services/DiscordOAuthService'
import type { SessionData } from '../../src/services/SessionService'
import type { GuildAccessContext } from '../../src/services/GuildAccessService'

export const MOCK_DISCORD_USER: DiscordUser = {
    id: '123456789012345678',
    username: 'testuser',
    discriminator: '0001',
    avatar: 'a_1234567890abcdef',
    email: 'test@example.com',
    verified: true,
}

export const MOCK_DISCORD_GUILD: DiscordGuild = {
    id: '111111111111111111',
    name: 'Test Server',
    icon: 'a_111111111111111111',
    owner: true,
    permissions: '2147483647',
    features: ['COMMUNITY', 'NEWS'],
}

export const MOCK_DISCORD_GUILDS: DiscordGuild[] = [
    MOCK_DISCORD_GUILD,
    {
        id: '222222222222222222',
        name: 'Test Server 2',
        icon: null,
        owner: false,
        permissions: '268435456',
        features: [],
    },
]

export const MOCK_TOKEN_RESPONSE = {
    access_token: 'mock_access_token_12345',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'mock_refresh_token_67890',
    scope: 'identify guilds',
}

export const MOCK_SESSION_DATA: SessionData = {
    userId: MOCK_DISCORD_USER.id,
    accessToken: MOCK_TOKEN_RESPONSE.access_token,
    refreshToken: MOCK_TOKEN_RESPONSE.refresh_token,
    user: MOCK_DISCORD_USER,
    expiresAt: Date.now() + MOCK_TOKEN_RESPONSE.expires_in * 1000 + 10000,
}

export const MOCK_EXPIRED_SESSION_DATA: SessionData = {
    ...MOCK_SESSION_DATA,
    expiresAt: Date.now() - 1000,
}

export const MOCK_AUTH_CODE = 'mock_authorization_code_12345'

export const MOCK_SESSION_ID = 'mock_session_id_12345'

export const MOCK_OAUTH_STATE = 'a'.repeat(64)

export const MOCK_GUILD_CONTEXT: GuildAccessContext = {
    guildId: '111111111111111111',
    owner: true,
    isAdmin: true,
    hasBot: true,
    botPresenceChecked: true,
    roleIds: [],
    nickname: null,
    effectiveAccess: {
        overview: 'manage',
        settings: 'manage',
        moderation: 'manage',
        automation: 'manage',
        music: 'manage',
        integrations: 'manage',
    },
    canManageRbac: true,
}
