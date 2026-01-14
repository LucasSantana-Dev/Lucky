import { errorLog, debugLog } from '../utils/general/log'

let environmentLoaded = false

let configCache: {
    TOKEN: string | undefined
    CLIENT_ID: string | undefined
    COMMANDS_DISABLED: string[]
    COMMAND_CATEGORIES_DISABLED: string[]
} | null = null

/**
 * Mark that environment variables have been loaded
 * This should be called by loadEnvironment() after loading .env files
 */
export const setEnvironmentLoaded = () => {
    environmentLoaded = true
    debugLog({ message: 'Environment marked as loaded in config module' })
}

/**
 * Parse comma-separated environment variable into array
 */
function parseCommaSeparated(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
}

/**
 * Validate critical environment variables
 */
function validateCriticalVariables(
    token: string | undefined,
    clientId: string | undefined,
): void {
    if (token === undefined || token === '') {
        errorLog({
            message: 'DISCORD_TOKEN is not defined in environment variables',
        })
    }

    if (clientId === undefined || clientId === '') {
        errorLog({
            message: 'CLIENT_ID is not defined in environment variables',
        })
    }
}

/**
 * Log environment variable status
 */
function logEnvironmentStatus(
    token: string | undefined,
    clientId: string | undefined,
): void {
    const tokenStatus =
        token !== undefined && token !== '' ? '***' : 'undefined'
    const clientIdStatus =
        clientId !== undefined && clientId !== '' ? '***' : 'undefined'

    debugLog({
        message: `Environment variables in config(): DISCORD_TOKEN=${tokenStatus}, CLIENT_ID=${clientIdStatus}`,
    })
}

/**
 * Get configuration from environment variables
 * This function should be called after loadEnvironment() has been called
 */
export const config = () => {
    if (configCache) {
        return configCache
    }

    const token = process.env.DISCORD_TOKEN
    const clientId = process.env.CLIENT_ID
    const commandsDisabled = parseCommaSeparated(process.env.COMMANDS_DISABLED)
    const commandCategoriesDisabled = parseCommaSeparated(
        process.env.COMMAND_CATEGORIES_DISABLED,
    )

    if (environmentLoaded) {
        validateCriticalVariables(token, clientId)
        logEnvironmentStatus(token, clientId)
    }

    configCache = {
        TOKEN: token,
        CLIENT_ID: clientId,
        COMMANDS_DISABLED: commandsDisabled,
        COMMAND_CATEGORIES_DISABLED: commandCategoriesDisabled,
    }

    return configCache
}

export const clearConfigCache = (): void => {
    configCache = null
}

export const constants = {
    VOLUME: 50,
    MAX_AUTOPLAY_TRACKS: 50,
}

export const ENVIRONMENT_CONFIG = {
    DATABASE: {
        URL: process.env.DATABASE_URL,
        MAX_CONNECTIONS: parseInt(process.env.DATABASE_MAX_CONNECTIONS ?? '10'),
        CONNECTION_TIMEOUT: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT ?? '30000'),
        QUERY_TIMEOUT: parseInt(process.env.DATABASE_QUERY_TIMEOUT ?? '10000'),
    },
    REDIS: {
        HOST: process.env.REDIS_HOST ?? 'localhost',
        PORT: parseInt(process.env.REDIS_PORT ?? '6379'),
        PASSWORD: process.env.REDIS_PASSWORD,
        DB: parseInt(process.env.REDIS_DB ?? '0'),
    },
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
    DOWNLOAD: {
        TIMEOUT: parseInt(process.env.DOWNLOAD_TIMEOUT ?? '10000'),
        MAX_RETRIES: parseInt(process.env.DOWNLOAD_MAX_RETRIES ?? '3'),
        RETRY_DELAY: parseInt(process.env.DOWNLOAD_RETRY_DELAY ?? '1000'),
    },
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
    SESSIONS: {
        USER_SESSION_TTL: parseInt(process.env.USER_SESSION_TTL ?? '86400'),
        QUEUE_SESSION_TTL: parseInt(process.env.QUEUE_SESSION_TTL ?? '7200'),
        COMMAND_HISTORY_LIMIT: parseInt(
            process.env.COMMAND_HISTORY_LIMIT ?? '10',
        ),
    },
    CACHE: {
        TRACK_INFO_SIZE: parseInt(process.env.CACHE_TRACK_INFO_SIZE ?? '2000'),
        ARTIST_TITLE_SIZE: parseInt(
            process.env.CACHE_ARTIST_TITLE_SIZE ?? '2000',
        ),
        MEMO_SIZE: parseInt(process.env.CACHE_MEMO_SIZE ?? '5000'),
        TTL_HOURS: parseInt(process.env.CACHE_TTL_HOURS ?? '1'),
    },
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
    SEARCH: {
        TIMEOUT: parseInt(process.env.SEARCH_TIMEOUT ?? '15000'),
        RETRY_DELAY: parseInt(process.env.SEARCH_RETRY_DELAY ?? '5000'),
    },
    SPOTIFY: {
        CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
        CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    },
} as const

export type EnvironmentConfig = typeof ENVIRONMENT_CONFIG
