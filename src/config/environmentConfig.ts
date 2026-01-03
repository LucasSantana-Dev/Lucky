/**
 * Environment-based configuration for external services and timeouts
 */

// NodeJS types are available via @types/node

export const ENVIRONMENT_CONFIG = {
    // Database Configuration
    DATABASE: {
        URL: process.env.DATABASE_URL,
        MAX_CONNECTIONS: parseInt(process.env.DATABASE_MAX_CONNECTIONS ?? '10'),
        CONNECTION_TIMEOUT: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT ?? '30000'),
        QUERY_TIMEOUT: parseInt(process.env.DATABASE_QUERY_TIMEOUT ?? '10000'),
    },

    // Redis Configuration
    REDIS: {
        HOST: process.env.REDIS_HOST ?? 'localhost',
        PORT: parseInt(process.env.REDIS_PORT ?? '6379'),
        PASSWORD: process.env.REDIS_PASSWORD,
        DB: parseInt(process.env.REDIS_DB ?? '0'),
    },

    // TikTok Configuration
    TIKTOK: {
        API_HOSTNAME:
            process.env.TIKTOK_API_HOSTNAME ??
            'api16-normal-c-useast1a.tiktokv.com',
        REFERER_URL:
            process.env.TIKTOK_REFERER_URL ?? 'https://www.tiktok.com/',
        EXTRACTOR_RETRIES: parseInt(
            process.env.TIKTOK_EXTRACTOR_RETRIES ?? '3',
        ),
        FRAGMENT_RETRIES: parseInt(process.env.TIKTOK_FRAGMENT_RETRIES ?? '3'),
        SLEEP_INTERVAL: parseInt(process.env.TIKTOK_SLEEP_INTERVAL ?? '1'),
        MAX_SLEEP_INTERVAL: parseInt(
            process.env.TIKTOK_MAX_SLEEP_INTERVAL ?? '3',
        ),
    },

    // YouTube Configuration
    YOUTUBE: {
        CONNECTION_TIMEOUT: parseInt(
            process.env.YOUTUBE_CONNECTION_TIMEOUT ?? '120000',
        ),
        MAX_RETRIES: parseInt(process.env.YOUTUBE_MAX_RETRIES ?? '3'),
        RETRY_DELAY: parseInt(process.env.YOUTUBE_RETRY_DELAY ?? '1000'),
        MAX_EXTRACTORS: parseInt(process.env.YOUTUBE_MAX_EXTRACTORS ?? '5'),
        USER_AGENT:
            process.env.YOUTUBE_USER_AGENT ??
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },

    // Download Configuration
    DOWNLOAD: {
        TIMEOUT: parseInt(process.env.DOWNLOAD_TIMEOUT ?? '10000'),
        MAX_RETRIES: parseInt(process.env.DOWNLOAD_MAX_RETRIES ?? '3'),
        RETRY_DELAY: parseInt(process.env.DOWNLOAD_RETRY_DELAY ?? '1000'),
    },

    // Rate Limiting Configuration
    RATE_LIMITS: {
        COMMAND_WINDOW_MS: parseInt(
            process.env.RATE_LIMIT_COMMAND_WINDOW_MS ?? '60000',
        ),
        COMMAND_MAX_REQUESTS: parseInt(
            process.env.RATE_LIMIT_COMMAND_MAX_REQUESTS ?? '5',
        ),
        MUSIC_COMMAND_WINDOW_MS: parseInt(
            process.env.RATE_LIMIT_MUSIC_COMMAND_WINDOW_MS ?? '30000',
        ),
        MUSIC_COMMAND_MAX_REQUESTS: parseInt(
            process.env.RATE_LIMIT_MUSIC_COMMAND_MAX_REQUESTS ?? '3',
        ),
        DOWNLOAD_WINDOW_MS: parseInt(
            process.env.RATE_LIMIT_DOWNLOAD_WINDOW_MS ?? '300000',
        ),
        DOWNLOAD_MAX_REQUESTS: parseInt(
            process.env.RATE_LIMIT_DOWNLOAD_MAX_REQUESTS ?? '2',
        ),
    },

    // Session Configuration
    SESSIONS: {
        USER_SESSION_TTL: parseInt(process.env.USER_SESSION_TTL ?? '86400'), // 24 hours
        QUEUE_SESSION_TTL: parseInt(process.env.QUEUE_SESSION_TTL ?? '7200'), // 2 hours
        COMMAND_HISTORY_LIMIT: parseInt(
            process.env.COMMAND_HISTORY_LIMIT ?? '10',
        ),
    },

    // Cache Configuration
    CACHE: {
        TRACK_INFO_SIZE: parseInt(process.env.CACHE_TRACK_INFO_SIZE ?? '2000'),
        ARTIST_TITLE_SIZE: parseInt(
            process.env.CACHE_ARTIST_TITLE_SIZE ?? '2000',
        ),
        MEMO_SIZE: parseInt(process.env.CACHE_MEMO_SIZE ?? '5000'),
        TTL_HOURS: parseInt(process.env.CACHE_TTL_HOURS ?? '1'),
    },

    // Player Configuration
    PLAYER: {
        LEAVE_ON_EMPTY_COOLDOWN: parseInt(
            process.env.PLAYER_LEAVE_ON_EMPTY_COOLDOWN ?? '300000',
        ),
        LEAVE_ON_END_COOLDOWN: parseInt(
            process.env.PLAYER_LEAVE_ON_END_COOLDOWN ?? '300000',
        ),
        CONNECTION_TIMEOUT: parseInt(
            process.env.PLAYER_CONNECTION_TIMEOUT ?? '5000',
        ),
    },

    // Search Configuration
    SEARCH: {
        TIMEOUT: parseInt(process.env.SEARCH_TIMEOUT ?? '15000'),
        RETRY_DELAY: parseInt(process.env.SEARCH_RETRY_DELAY ?? '5000'),
    },

    // Spotify Configuration
    SPOTIFY: {
        CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
        CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    },
} as const

export type EnvironmentConfig = typeof ENVIRONMENT_CONFIG
