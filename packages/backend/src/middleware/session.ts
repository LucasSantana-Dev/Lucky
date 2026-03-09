import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import session from 'express-session'
import { RedisStore } from 'connect-redis'
import Redis from 'ioredis'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { Express } from 'express'

function createRedisStore(): session.Store | undefined {
    const host = process.env.REDIS_HOST || 'localhost'
    const port = Number(process.env.REDIS_PORT) || 6379
    const password = process.env.REDIS_PASSWORD || undefined

    try {
        const client = new Redis({
            host,
            port,
            password,
            lazyConnect: true,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) =>
                times > 3 ? null : Math.min(times * 200, 2000),
        })

        client.connect().catch(() => {
            debugLog({
                message: 'Redis not available, session store will degrade',
            })
        })

        return new RedisStore({ client, prefix: 'lucky:sess:' })
    } catch {
        return undefined
    }
}

function createFileStore(sessionPath: string): session.Store | undefined {
    try {
        mkdirSync(sessionPath, { recursive: true })
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileStoreFactory = require('session-file-store')
        const FileStore = FileStoreFactory(session)
        return new FileStore({
            path: sessionPath,
            ttl: 7 * 24 * 60 * 60,
            retries: 1,
            logFn: () => {},
        })
    } catch {
        return undefined
    }
}

export function setupSessionMiddleware(app: Express): void {
    const sessionSecret = process.env.WEBAPP_SESSION_SECRET

    if (!sessionSecret) {
        errorLog({
            message:
                'WEBAPP_SESSION_SECRET not configured. Session management will not work properly.',
        })
    }

    const isProduction = process.env.NODE_ENV === 'production'
    const sessionPath = join(process.cwd(), '.data', 'sessions')

    const store = createRedisStore() ?? createFileStore(sessionPath)

    const storeType =
        store instanceof RedisStore
            ? 'Redis'
            : store
              ? 'file-based'
              : 'in-memory'

    debugLog({ message: `Using ${storeType} session store` })

    app.use(
        session({
            ...(store ? { store } : {}),
            secret: sessionSecret ?? 'default-secret-change-in-production',
            resave: false,
            saveUninitialized: false,
            name: 'sessionId',
            cookie: {
                secure: isProduction,
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000,
                sameSite: 'lax',
                path: '/',
            },
        }),
    )
}
