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
