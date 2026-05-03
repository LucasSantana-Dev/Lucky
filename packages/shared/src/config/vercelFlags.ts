import { createClient, type FlagsClient } from '@vercel/flags-core'
import { debugLog } from '../utils/general/log'

let cachedConnectionString: string | null = null
let cachedClient: FlagsClient | null = null

function getFlagsConnectionString(): string | null {
    const value = process.env.FLAGS?.trim()
    return value && value.length > 0 ? value : null
}

export function isVercelFlagsConfigured(): boolean {
    return getFlagsConnectionString() !== null
}

export function getVercelFlagsClient(): FlagsClient | null {
    const connectionString = getFlagsConnectionString()

    if (connectionString === null) {
        cachedConnectionString = null
        cachedClient = null
        return null
    }

    if (cachedClient && cachedConnectionString === connectionString) {
        return cachedClient
    }

    try {
        cachedClient = createClient(connectionString)
        cachedConnectionString = connectionString
        return cachedClient
    } catch (error) {
        debugLog({
            message: 'Vercel Flags configuration is invalid',
            error,
        })
        cachedConnectionString = null
        cachedClient = null
        return null
    }
}
