import { config } from 'dotenv'
import { setLogLevel, debugLog } from '../utils/general/log'
import { setEnvironmentLoaded } from './config'
import path from 'path'
import fs from 'fs'

/**
 * Check if we're in development mode
 */
function isDevelopmentMode(): boolean {
    return (
        process.env.NODE_ENV === 'development' ||
        process.argv.includes('--dev') ||
        process.argv.includes('--development')
    )
}

/**
 * Load environment files in order of priority
 */
function loadEnvironmentFiles(): { result: unknown; loadedFile: string } {
    const isDevelopment = isDevelopmentMode()
    const envFiles = isDevelopment ? ['.env.local', '.env'] : ['.env']

    for (const envFile of envFiles) {
        const envPath = path.resolve(process.cwd(), envFile)
        if (fs.existsSync(envPath)) {
            const result = config({ path: envPath })
            return { result, loadedFile: envFile }
        }
    }

    return { result: config(), loadedFile: '.env (default)' }
}

/**
 * Handle environment loading errors
 */
function handleEnvironmentErrors(result: unknown): void {
    if (
        result !== null &&
        result !== undefined &&
        typeof result === 'object' &&
        'error' in result
    ) {
        const { error } = result as { error: Error & { code?: string } }
        if (error.code !== 'ENOENT') {
            throw error
        }
    }
}

/**
 * Check if a string is valid (not null, undefined, or empty)
 */
function isValidString(value: string | undefined): boolean {
    return value !== undefined && value !== ''
}

/**
 * Trim environment variable if it's valid
 */
function trimEnvironmentVariable(key: string): void {
    const value = process.env[key]
    if (isValidString(value) && value !== null && value !== undefined) {
        process.env[key] = value.trim()
    }
}

/**
 * Log warning if environment variable is missing
 */
function logMissingEnvironmentVariable(key: string): void {
    const value = process.env[key]
    if (!isValidString(value)) {
        debugLog({
            message: `Warning: ${key} is not defined in environment variables`,
        })
    }
}

/**
 * Trim and validate critical environment variables
 */
function validateEnvironmentVariables(): void {
    trimEnvironmentVariable('DISCORD_TOKEN')
    trimEnvironmentVariable('CLIENT_ID')
    logMissingEnvironmentVariable('DISCORD_TOKEN')
    logMissingEnvironmentVariable('CLIENT_ID')
}

/**
 * Configure logging level
 */
function configureLogging(): void {
    const logLevel =
        process.env.LOG_LEVEL !== undefined && process.env.LOG_LEVEL !== ''
            ? parseInt(process.env.LOG_LEVEL)
            : 2
    setLogLevel(logLevel as 0 | 1 | 2 | 3 | 4)
}

/**
 * Load environment variables from .env files
 * In development mode, it will try to load from .env.local first, then fall back to .env
 * In production mode, it will only load from .env
 */
export function loadEnvironment() {
    const { result, loadedFile } = loadEnvironmentFiles()

    handleEnvironmentErrors(result)

    debugLog({
        message: `Loaded environment from ${loadedFile} (NODE_ENV: ${process.env.NODE_ENV ?? 'not set'})`,
    })

    validateEnvironmentVariables()
    configureLogging()
    setEnvironmentLoaded()

    return process.env
}
