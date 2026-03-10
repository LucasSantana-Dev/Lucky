import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import session from 'express-session'
import { RedisStore } from 'connect-redis'
import Redis from 'ioredis'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { Express } from 'express'

type RedisExpiration = {
    type: 'EX' | 'PX'
    value: number
}

type RedisSetOptions = {
    expiration?: RedisExpiration
}

type RedisScanOptions = {
    MATCH: string
    COUNT: number
}

type ConnectRedisClient = {
    get: (key: string) => Promise<string | null>
    set: (
        key: string,
        value: string,
        options?: RedisSetOptions,
    ) => Promise<unknown>
    expire: (key: string, ttl: number) => Promise<number>
    del: (keys: string[]) => Promise<number>
    mGet: (keys: string[]) => Promise<(string | null)[]>
    scanIterator: (options: RedisScanOptions) => AsyncIterable<string[]>
}

type RedisStoreClient = ConstructorParameters<typeof RedisStore>[0]['client']

async function* scanWithIoredis(
    client: Redis,
    match: string,
    count: number,
): AsyncIterable<string[]> {
    let cursor = '0'

    do {
        const [nextCursor, keys] = (await client.scan(
            cursor,
            'MATCH',
            match,
            'COUNT',
            String(count),
        )) as [string, string[]]

        cursor = nextCursor

        if (keys.length > 0) {
            yield keys
        }
    } while (cursor !== '0')
}

export function createConnectRedisClientAdapter(
    client: Redis,
): ConnectRedisClient {
    return {
        get: (key) => client.get(key),
        set: async (key, value, options) => {
            const expiration = options?.expiration

            if (expiration?.type === 'EX') {
                return client.set(key, value, 'EX', expiration.value)
            }

            if (expiration?.type === 'PX') {
                return client.set(key, value, 'PX', expiration.value)
            }

            return client.set(key, value)
        },
        expire: (key, ttl) => client.expire(key, ttl),
        del: (keys) =>
            keys.length > 0 ? client.del(...keys) : Promise.resolve(0),
        mGet: (keys) =>
            keys.length > 0 ? client.mget(...keys) : Promise.resolve([]),
        scanIterator: ({ MATCH, COUNT }) =>
            scanWithIoredis(client, MATCH, COUNT),
    }
}

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

        const storeClient = createConnectRedisClientAdapter(client)
        return new RedisStore({
            client: storeClient as unknown as RedisStoreClient,
            prefix: 'lucky:sess:',
        })
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
