import { config } from "dotenv"
import { LogLevel, setLogLevel, debugLog } from "../utils/general/log"
import { setEnvironmentLoaded } from "./config"
import path from "path"
import fs from "fs"

/**
 * Load environment variables from .env files
 * In development mode, it will try to load from .env.local first, then fall back to .env
 * In production mode, it will only load from .env
 */
export function loadEnvironment() {
    const isDevelopment =
        process.env.NODE_ENV === "development" ||
        process.argv.includes("--dev") ||
        process.argv.includes("--development")

    const envFiles = isDevelopment ? [".env.local", ".env"] : [".env"]

    let result
    let loaded = false
    let loadedFile = ""

    for (const envFile of envFiles) {
        const envPath = path.resolve(process.cwd(), envFile)
        if (fs.existsSync(envPath)) {
            result = config({ path: envPath })
            loaded = true
            loadedFile = envFile
            break
        }
    }

    if (!loaded) {
        result = config()
        loadedFile = ".env (default)"
    }

    if (result?.error) {
        if ((result.error as Error & { code?: string }).code !== "ENOENT") {
            throw result.error
        }
    }

    debugLog({
        message: `Loaded environment from ${loadedFile} (NODE_ENV: ${process.env.NODE_ENV ?? "not set"})`,
    })

    if (!process.env.DISCORD_TOKEN) {
        debugLog({
            message:
                "Warning: DISCORD_TOKEN is not defined in environment variables",
        })
    }

    if (!process.env.CLIENT_ID) {
        debugLog({
            message:
                "Warning: CLIENT_ID is not defined in environment variables",
        })
    }

    const logLevel = process.env.LOG_LEVEL
        ? parseInt(process.env.LOG_LEVEL)
        : LogLevel.INFO
    setLogLevel(logLevel)

    setEnvironmentLoaded()

    return process.env
}
