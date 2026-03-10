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
type SessionMethodName = 'get' | 'set' | 'destroy' | 'touch'
type SessionCallback = (error?: unknown, data?: unknown) => void

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

export class ResilientSessionStore extends session.Store {
    private fallbackActive = false

    constructor(
        private readonly primaryStore: session.Store,
        private readonly fallbackStore: session.Store,
    ) {
        super()
    }

    private activateFallback(error: unknown): void {
        if (this.fallbackActive) {
            return
        }

        this.fallbackActive = true
        errorLog({
            message:
                'Redis session store unavailable. Switching to local fallback store.',
            error,
        })
    }

    private invokeStoreMethod(
        store: session.Store,
        methodName: SessionMethodName,
        args: unknown[],
        callback: SessionCallback,
    ): void {
        const storeMethod = (store as unknown as Record<string, unknown>)[
            methodName
        ]

        if (typeof storeMethod !== 'function') {
            callback()
            return
        }

        try {
            ;(storeMethod as (...params: unknown[]) => void).call(
                store,
                ...args,
                callback,
            )
        } catch (error) {
            callback(error)
        }
    }

    private execute(
        methodName: SessionMethodName,
        args: unknown[],
        callback: SessionCallback,
    ): void {
        if (this.fallbackActive) {
            this.invokeStoreMethod(this.fallbackStore, methodName, args, callback)
            return
        }

        this.invokeStoreMethod(
            this.primaryStore,
            methodName,
            args,
            (error, data) => {
                if (!error) {
                    callback(undefined, data)
                    return
                }

                this.activateFallback(error)
                this.invokeStoreMethod(
                    this.fallbackStore,
                    methodName,
                    args,
                    callback,
                )
            },
        )
    }

    get(
        sid: string,
        callback: (error?: unknown, sessionData?: session.SessionData | null) => void,
    ): void {
        this.execute('get', [sid], callback as SessionCallback)
    }

    set(
        sid: string,
        sessionData: session.SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        this.execute('set', [sid, sessionData], callback as SessionCallback)
    }

    destroy(
        sid: string,
        callback: (error?: unknown) => void = () => {},
    ): void {
        this.execute('destroy', [sid], callback as SessionCallback)
    }

    touch(
        sid: string,
        sessionData: session.SessionData,
        callback: () => void = () => {},
    ): void {
        this.execute('touch', [sid, sessionData], callback as SessionCallback)
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
            lazyConnect: false,
            enableOfflineQueue: false,
            connectTimeout: 1500,
            maxRetriesPerRequest: 1,
            retryStrategy: (times) =>
                times > 1 ? null : Math.min(times * 200, 1000),
        })

        client.on('error', () => {
            debugLog({
                message:
                    'Redis session client unavailable. Local fallback will be used on errors.',
            })
        })
        client.on('ready', () => {
            debugLog({ message: 'Redis session client connected' })
        })

        const storeClient = createConnectRedisClientAdapter(client)
        return new RedisStore({
            client: storeClient as unknown as RedisStoreClient,
            prefix: 'lucky:sess:',
        })
    } catch (error) {
        debugLog({
            message:
                'Redis session store initialization failed. Using local session store.',
            error,
        })
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

function createLocalFallbackStore(sessionPath: string): session.Store {
    const fileStore = createFileStore(sessionPath)
    if (fileStore) {
        return fileStore
    }

    return new session.MemoryStore()
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
    const fallbackStore = createLocalFallbackStore(sessionPath)
    const redisStore = createRedisStore()
    const store = redisStore
        ? new ResilientSessionStore(redisStore, fallbackStore)
        : fallbackStore

    const isMemoryFallback = fallbackStore.constructor.name === 'MemoryStore'
    let storeType = 'file-based'
    if (redisStore) {
        storeType = isMemoryFallback
            ? 'Redis with in-memory fallback'
            : 'Redis with file fallback'
    } else if (isMemoryFallback) {
        storeType = 'in-memory'
    }

    debugLog({ message: `Using ${storeType} session store` })

    app.use(
        session({
            store,
            secret: sessionSecret ?? 'default-secret-change-in-production',
            resave: false,
            saveUninitialized: false,
            name: 'sessionId',
            proxy: isProduction,
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
