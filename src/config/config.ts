import { errorLog, debugLog } from "../utils/general/log"

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
    debugLog({ message: "Environment marked as loaded in config module" })
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

    const commandsDisabled = (process.env.COMMANDS_DISABLED ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    const commandCategoriesDisabled = (
        process.env.COMMAND_CATEGORIES_DISABLED ?? ""
    )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

    if (environmentLoaded) {
        if (!token) {
            errorLog({
                message:
                    "DISCORD_TOKEN is not defined in environment variables",
            })
        }

        if (!clientId) {
            errorLog({
                message: "CLIENT_ID is not defined in environment variables",
            })
        }

        debugLog({
            message: `Environment variables in config(): DISCORD_TOKEN=${token ? "***" : "undefined"}, CLIENT_ID=${clientId ? "***" : "undefined"}`,
        })
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
