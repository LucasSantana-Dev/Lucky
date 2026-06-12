import { errorLog, debugLog } from '../utils/general/log'
import { parseIntEnv } from '../utils/env'

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
    MUSIC_WATCHDOG_TIMEOUT_MS: parseIntEnv(
        'MUSIC_WATCHDOG_TIMEOUT_MS',
        25000,
    ),
    MUSIC_PROVIDER_COOLDOWN_MS: parseIntEnv(
        'MUSIC_PROVIDER_COOLDOWN_MS',
        120000,
    ),
    MUSIC_SESSION_RESTORE_ENABLED:
        process.env.MUSIC_SESSION_RESTORE_ENABLED !== 'false',
    AUTOPLAY_DISLIKE_TTL_HOURS: parseIntEnv(
        'AUTOPLAY_DISLIKE_TTL_HOURS',
        24,
    ),
}

export const ENVIRONMENT_CONFIG = {
    DATABASE: {
        URL: process.env.DATABASE_URL,
        MAX_CONNECTIONS: parseIntEnv('DATABASE_MAX_CONNECTIONS', 10),
        CONNECTION_TIMEOUT: parseIntEnv(
            'DATABASE_CONNECTION_TIMEOUT',
            30000,
        ),
        QUERY_TIMEOUT: parseIntEnv('DATABASE_QUERY_TIMEOUT', 10000),
    },
    REDIS: {
        HOST: process.env.REDIS_HOST ?? 'localhost',
        PORT: parseIntEnv('REDIS_PORT', 6379),
        PASSWORD: process.env.REDIS_PASSWORD,
        DB: parseIntEnv('REDIS_DB', 0),
    },
    TIKTOK: {
        API_HOSTNAME:
            process.env.TIKTOK_API_HOSTNAME ??
            'api16-normal-c-useast1a.tiktokv.com',
        REFERER_URL:
            process.env.TIKTOK_REFERER_URL ?? 'https://www.tiktok.com/',
        EXTRACTOR_RETRIES: parseIntEnv(
            'TIKTOK_EXTRACTOR_RETRIES',
            3,
        ),
        FRAGMENT_RETRIES: parseIntEnv('TIKTOK_FRAGMENT_RETRIES', 3),
        SLEEP_INTERVAL: parseIntEnv('TIKTOK_SLEEP_INTERVAL', 1),
        MAX_SLEEP_INTERVAL: parseIntEnv(
            'TIKTOK_MAX_SLEEP_INTERVAL',
            3,
        ),
    },
    YOUTUBE: {
        CONNECTION_TIMEOUT: parseIntEnv(
            'YOUTUBE_CONNECTION_TIMEOUT',
            120000,
        ),
        MAX_RETRIES: parseIntEnv('YOUTUBE_MAX_RETRIES', 3),
        RETRY_DELAY: parseIntEnv('YOUTUBE_RETRY_DELAY', 1000),
        MAX_EXTRACTORS: parseIntEnv('YOUTUBE_MAX_EXTRACTORS', 5),
        USER_AGENT:
            process.env.YOUTUBE_USER_AGENT ??
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    DOWNLOAD: {
        TIMEOUT: parseIntEnv('DOWNLOAD_TIMEOUT', 10000),
        MAX_RETRIES: parseIntEnv('DOWNLOAD_MAX_RETRIES', 3),
        RETRY_DELAY: parseIntEnv('DOWNLOAD_RETRY_DELAY', 1000),
    },
    RATE_LIMITS: {
        COMMAND_WINDOW_MS: parseIntEnv(
            'RATE_LIMIT_COMMAND_WINDOW_MS',
            60000,
        ),
        COMMAND_MAX_REQUESTS: parseIntEnv(
            'RATE_LIMIT_COMMAND_MAX_REQUESTS',
            5,
        ),
        MUSIC_COMMAND_WINDOW_MS: parseIntEnv(
            'RATE_LIMIT_MUSIC_COMMAND_WINDOW_MS',
            30000,
        ),
        MUSIC_COMMAND_MAX_REQUESTS: parseIntEnv(
            'RATE_LIMIT_MUSIC_COMMAND_MAX_REQUESTS',
            3,
        ),
        DOWNLOAD_WINDOW_MS: parseIntEnv(
            'RATE_LIMIT_DOWNLOAD_WINDOW_MS',
            300000,
        ),
        DOWNLOAD_MAX_REQUESTS: parseIntEnv(
            'RATE_LIMIT_DOWNLOAD_MAX_REQUESTS',
            2,
        ),
    },
    SESSIONS: {
        USER_SESSION_TTL: parseIntEnv('USER_SESSION_TTL', 86400),
        QUEUE_SESSION_TTL: parseIntEnv('QUEUE_SESSION_TTL', 7200),
        COMMAND_HISTORY_LIMIT: parseIntEnv(
            'COMMAND_HISTORY_LIMIT',
            10,
        ),
    },
    CACHE: {
        TRACK_INFO_SIZE: parseIntEnv('CACHE_TRACK_INFO_SIZE', 2000),
        ARTIST_TITLE_SIZE: parseIntEnv(
            'CACHE_ARTIST_TITLE_SIZE',
            2000,
        ),
        MEMO_SIZE: parseIntEnv('CACHE_MEMO_SIZE', 5000),
        TTL_HOURS: parseIntEnv('CACHE_TTL_HOURS', 1),
    },
    PLAYER: {
        LEAVE_ON_EMPTY_COOLDOWN: parseIntEnv(
            'PLAYER_LEAVE_ON_EMPTY_COOLDOWN',
            300000,
        ),
        LEAVE_ON_END_COOLDOWN: parseIntEnv(
            'PLAYER_LEAVE_ON_END_COOLDOWN',
            300000,
        ),
        CONNECTION_TIMEOUT: parseIntEnv(
            'PLAYER_CONNECTION_TIMEOUT',
            15000,
        ),
    },
    SEARCH: {
        TIMEOUT: parseIntEnv('SEARCH_TIMEOUT', 15000),
        RETRY_DELAY: parseIntEnv('SEARCH_RETRY_DELAY', 5000),
    },
    MUSIC: {
        WATCHDOG_TIMEOUT_MS: parseIntEnv(
            'MUSIC_WATCHDOG_TIMEOUT_MS',
            25000,
        ),
        PROVIDER_COOLDOWN_MS: parseIntEnv(
            'MUSIC_PROVIDER_COOLDOWN_MS',
            120000,
        ),
        SESSION_RESTORE_ENABLED:
            process.env.MUSIC_SESSION_RESTORE_ENABLED !== 'false',
        AUTOPLAY_DISLIKE_TTL_HOURS: parseIntEnv(
            'AUTOPLAY_DISLIKE_TTL_HOURS',
            24,
        ),
    },
    SPOTIFY: {
        CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
        CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    },
} as const

export type EnvironmentConfig = typeof ENVIRONMENT_CONFIG

/**
 * Get the Support URL from environment variables (optional).
 * Returns the SUPPORT_URL if set, or undefined if not configured.
 * This allows graceful degradation when support infrastructure is optional.
 *
 * @returns SUPPORT_URL string or undefined
 */
export function getSupportUrl(): string | undefined {
    const url = process.env.SUPPORT_URL?.trim()
    return url ? url : undefined
}
