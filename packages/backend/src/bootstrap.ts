import {
    ensureEnvironment,
    validateBackendEnvironment,
} from '@lucky/shared/config'
import { redisClient } from '@lucky/shared/services'
import {
    initializeSentry,
    setupErrorHandlers,
    startHeartbeat,
    verifyRequiredDatabaseRelations,
    warnLog,
} from '@lucky/shared/utils'
import { startWebApp } from './server'

export async function bootstrapBackend(): Promise<void> {
    await ensureEnvironment()
    validateBackendEnvironment()
    setupErrorHandlers()
    initializeSentry({
        appName: 'lucky',
        serviceName: 'backend',
        // || not ??: compose sets SENTRY_RELEASE to "" when unset, which is
        // not nullish and would block the COMMIT_SHA fallback
        release: process.env.SENTRY_RELEASE || process.env.COMMIT_SHA,
        serverName: process.env.HOSTNAME,
        tags: { runtime: 'express' },
    })
    startHeartbeat({ serviceName: 'backend' })
    await verifyRequiredDatabaseRelations()

    try {
        const connected = await redisClient.connect()
        if (!connected) {
            warnLog({
                message:
                    'Redis shared client unavailable. Backend starting with fallback behavior.',
            })
        }
    } catch (error) {
        warnLog({
            message:
                'Redis shared client connection failed. Backend starting with fallback behavior.',
            error,
        })
    }

    startWebApp()
}
