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

    const rootDir = findProjectRoot()

    for (const envFile of envFiles) {
        const envPath = path.resolve(rootDir, envFile)
        if (fs.existsSync(envPath)) {
            const result = config({ path: envPath })
            return { result, loadedFile: envFile }
        }
    }

    return { result: config(), loadedFile: '.env (default)' }
}

function findProjectRoot(): string {
    let currentDir = process.cwd()
    const maxDepth = 10
    let depth = 0

    while (depth < maxDepth) {
        const packageJsonPath = path.join(currentDir, 'package.json')
        const envPath = path.join(currentDir, '.env')

        if (fs.existsSync(packageJsonPath) && fs.existsSync(envPath)) {
            return currentDir
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) {
            break
        }
        currentDir = parentDir
        depth++
    }

    return process.cwd()
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

function isInfisicalConfigured(): boolean {
    const clientId = process.env.INFISICAL_CLIENT_ID
    const clientSecret = process.env.INFISICAL_CLIENT_SECRET
    const projectId = process.env.INFISICAL_PROJECT_ID
    const envSlug = process.env.INFISICAL_ENV
    return (
        typeof clientId === 'string' &&
        clientId.length > 0 &&
        typeof clientSecret === 'string' &&
        clientSecret.length > 0 &&
        typeof projectId === 'string' &&
        projectId.length > 0 &&
        typeof envSlug === 'string' &&
        envSlug.length > 0
    )
}

type InfisicalSecret = { secretKey: string; secretValue?: string | null }
type InfisicalListSecretsResponse = { secrets?: InfisicalSecret[] }

async function loadInfisicalSecrets(): Promise<void> {
    if (!isInfisicalConfigured()) return
    try {
        const { InfisicalSDK } = await import('@infisical/sdk')
        const siteUrl = process.env.INFISICAL_SITE_URL
        const client = new InfisicalSDK(
            siteUrl ? { siteUrl } : undefined
        )
        await client.auth().universalAuth.login({
            clientId: process.env.INFISICAL_CLIENT_ID!,
            clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
        })
        const projectId = process.env.INFISICAL_PROJECT_ID!
        const environment = process.env.INFISICAL_ENV!
        const secretPath = process.env.INFISICAL_SECRET_PATH ?? '/'
        const response = (await client.secrets().listSecrets({
            projectId,
            environment,
            secretPath,
            expandSecretReferences: true,
            viewSecretValue: true,
            includeImports: true,
        })) as InfisicalListSecretsResponse
        const secrets = response.secrets ?? []
        for (const secret of secrets) {
            const key = secret.secretKey
            const value = secret.secretValue
            if (key && value != null && typeof value === 'string') {
                process.env[key] = value
            }
        }
        debugLog({
            message: `Loaded ${secrets.length} secrets from Infisical (project: ${projectId}, env: ${environment})`,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('Cannot find module') || message.includes('MODULE_NOT_FOUND')) {
            debugLog({
                message: 'Infisical SDK not installed; skip loading from Infisical. Install @infisical/sdk to use Infisical.',
            })
            return
        }
        throw err
    }
}

/**
 * Load environment variables from .env files.
 * In development mode, it will try to load from .env.local first, then fall back to .env.
 * In production mode, it will only load from .env.
 * For Infisical-backed secrets, use loadEnvironmentAsync() and set INFISICAL_* env vars.
 */
export function loadEnvironment(): NodeJS.ProcessEnv {
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

/**
 * Async variant that loads .env first, then fetches Infisical secrets when configured.
 * Use this when INFISICAL_* env vars are set so secrets are loaded before the app runs.
 */
export async function loadEnvironmentAsync(): Promise<NodeJS.ProcessEnv> {
    const { result, loadedFile } = loadEnvironmentFiles()

    handleEnvironmentErrors(result)

    await loadInfisicalSecrets()

    debugLog({
        message: `Loaded environment from ${loadedFile} (NODE_ENV: ${process.env.NODE_ENV ?? 'not set'})`,
    })

    validateEnvironmentVariables()
    configureLogging()
    setEnvironmentLoaded()

    return process.env
}

/**
 * Load environment: .env first, then Infisical secrets when INFISICAL_* is set.
 * Use in async entrypoints to support both .env and Infisical.
 */
export async function ensureEnvironment(): Promise<NodeJS.ProcessEnv> {
    const { result, loadedFile } = loadEnvironmentFiles()
    handleEnvironmentErrors(result)
    if (isInfisicalConfigured()) {
        await loadInfisicalSecrets()
    }
    debugLog({
        message: `Loaded environment from ${loadedFile} (NODE_ENV: ${process.env.NODE_ENV ?? 'not set'})`,
    })
    validateEnvironmentVariables()
    configureLogging()
    setEnvironmentLoaded()
    return process.env
}
