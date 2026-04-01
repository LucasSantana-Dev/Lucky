import { ensureEnvironment } from '@lucky/shared/config'
import { redisClient } from '@lucky/shared/services'
import {
    initializeSentry,
    setupErrorHandlers,
    warnLog,
} from '@lucky/shared/utils'
import { startWebApp } from './server'
import { verifyRequiredDatabaseState } from './startup/verifyRequiredDatabaseState'

export async function bootstrapBackend(): Promise<void> {
    await ensureEnvironment()
    setupErrorHandlers()
    initializeSentry({
        appName: 'lucky',
        serviceName: 'backend',
        release: process.env.SENTRY_RELEASE ?? process.env.COMMIT_SHA,
        serverName: process.env.HOSTNAME,
        tags: { runtime: 'express' },
    })
    await verifyRequiredDatabaseState()

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
