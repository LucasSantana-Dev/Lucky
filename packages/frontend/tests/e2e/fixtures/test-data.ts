export const MOCK_DISCORD_USER = {
    id: '123456789012345678',
    username: 'testuser',
    discriminator: '0001',
    avatar: 'a_1234567890abcdef',
    email: 'test@example.com',
}

export const MOCK_OAUTH_STATE =
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2'

export const MOCK_AUTH_CODE = 'mock_authorization_code_12345'

export const MOCK_ACCESS_TOKEN = 'mock_access_token_abcdef123456'
export const MOCK_REFRESH_TOKEN = 'mock_refresh_token_xyz789'

export const MOCK_TOKEN_RESPONSE = {
    access_token: MOCK_ACCESS_TOKEN,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: MOCK_REFRESH_TOKEN,
    scope: 'identify guilds',
}

export const TEST_ENV = {
    CLIENT_ID: '962198089161134131',
    WEBAPP_REDIRECT_URI: 'http://localhost:3000/api/auth/callback',
    WEBAPP_FRONTEND_URL: 'http://localhost:5173',
    WEBAPP_PORT: '3000',
}

export const MOCK_GUILDS = [
    {
        id: '111111111111111111',
        name: 'Test Server 1',
        icon: 'a_111111111111111111',
        owner: true,
        permissions: '2147483647',
        features: ['COMMUNITY', 'NEWS'],
        hasBot: true,
        botInviteUrl: undefined,
    },
    {
        id: '222222222222222222',
        name: 'Test Server 2',
        icon: null,
        owner: false,
        permissions: '268435456',
        features: [],
        hasBot: false,
        botInviteUrl:
            'https://discord.com/api/oauth2/authorize?client_id=962198089161134131&permissions=8&scope=bot%20applications.commands&guild_id=222222222222222222',
    },
    {
        id: '333333333333333333',
        name: 'Test Server 3',
        icon: 'a_333333333333333333',
        owner: true,
        permissions: '2147483647',
        features: ['VERIFIED'],
        hasBot: true,
        botInviteUrl: undefined,
    },
]

export const MOCK_FEATURES = [
    {
        name: 'DOWNLOAD_VIDEO',
        description: 'Enable video download functionality',
        isGlobal: false,
    },
    {
        name: 'DOWNLOAD_AUDIO',
        description: 'Enable audio download functionality',
        isGlobal: false,
    },
    {
        name: 'MUSIC_RECOMMENDATIONS',
        description: 'Enable music recommendations',
        isGlobal: false,
    },
    {
        name: 'AUTOPLAY',
        description: 'Enable autoplay for music queue',
        isGlobal: false,
    },
    {
        name: 'LYRICS',
        description: 'Enable lyrics display',
        isGlobal: false,
    },
    {
        name: 'QUEUE_MANAGEMENT',
        description: 'Enable advanced queue management',
        isGlobal: false,
    },
    {
        name: 'REACTION_ROLES',
        description: 'Enable reaction roles feature',
        isGlobal: false,
    },
    {
        name: 'ROLE_MANAGEMENT',
        description: 'Enable role management features',
        isGlobal: false,
    },
]

export const MOCK_GLOBAL_TOGGLES = {
    DOWNLOAD_VIDEO: true,
    DOWNLOAD_AUDIO: true,
    MUSIC_RECOMMENDATIONS: false,
    AUTOPLAY: true,
    LYRICS: true,
    QUEUE_MANAGEMENT: true,
    REACTION_ROLES: false,
    ROLE_MANAGEMENT: true,
}

export const MOCK_SERVER_TOGGLES = {
    DOWNLOAD_VIDEO: true,
    DOWNLOAD_AUDIO: true,
    MUSIC_RECOMMENDATIONS: true,
    AUTOPLAY: false,
    LYRICS: true,
    QUEUE_MANAGEMENT: true,
    REACTION_ROLES: true,
    ROLE_MANAGEMENT: false,
}

export const MOCK_SERVER_SETTINGS = {
    prefix: '!',
    language: 'en',
    timezone: 'UTC',
    moderation: {
        enabled: true,
        autoMod: false,
    },
}

export const MOCK_SERVER_LISTING = {
    name: 'Test Server 1',
    description: 'A test server for LukBot',
    tags: ['music', 'community'],
    verified: false,
}

export const MOCK_API_RESPONSES = {
    guildsList: {
        guilds: MOCK_GUILDS,
    },
    featuresList: {
        features: MOCK_FEATURES,
    },
    globalToggles: {
        toggles: MOCK_GLOBAL_TOGGLES,
    },
    serverToggles: {
        guildId: '111111111111111111',
        toggles: MOCK_SERVER_TOGGLES,
    },
    serverSettings: {
        settings: MOCK_SERVER_SETTINGS,
    },
    serverListing: {
        listing: MOCK_SERVER_LISTING,
    },
    authStatus: {
        authenticated: true,
        user: MOCK_DISCORD_USER,
    },
    authUser: MOCK_DISCORD_USER,
    inviteUrl: {
        inviteUrl:
            'https://discord.com/api/oauth2/authorize?client_id=962198089161134131&permissions=8&scope=bot%20applications.commands',
    },
}
