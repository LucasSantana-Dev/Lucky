import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import session from 'express-session'
import sessionFileStoreFactory from 'session-file-store'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { Express } from 'express'
import { PrismaSessionStore } from './prismaSessionStore'

type SessionMethodName = 'get' | 'set' | 'destroy' | 'touch'
type SessionCallback = (error?: unknown, data?: unknown) => void

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
                'Primary session store unavailable. Switching to local fallback store.',
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
            this.invokeStoreMethod(
                this.fallbackStore,
                methodName,
                args,
                callback,
            )
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
        callback: (
            error?: unknown,
            sessionData?: session.SessionData | null,
        ) => void,
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

    destroy(sid: string, callback: (error?: unknown) => void = () => {}): void {
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

function createPrimaryStore(): session.Store | undefined {
    try {
        return new PrismaSessionStore()
    } catch (error) {
        debugLog({
            message:
                'Postgres session store initialization failed. Using local session store.',
            error,
        })
        return undefined
    }
}

function createFileStore(sessionPath: string): session.Store | undefined {
    try {
        mkdirSync(sessionPath, { recursive: true })
        const FileStore = sessionFileStoreFactory(session)
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
    const sessionSecret = process.env.WEBAPP_SESSION_SECRET?.trim()

    if (!sessionSecret) {
        throw new Error(
            'WEBAPP_SESSION_SECRET environment variable is required. Session management cannot initialize securely.',
        )
    }

    const isProduction = process.env.NODE_ENV === 'production'
    const sessionPath = join(process.cwd(), '.data', 'sessions')
    const fallbackStore = createLocalFallbackStore(sessionPath)
    const primaryStore = createPrimaryStore()
    const store = primaryStore
        ? new ResilientSessionStore(primaryStore, fallbackStore)
        : fallbackStore

    const isMemoryFallback = fallbackStore.constructor.name === 'MemoryStore'

    app.use(
        session({
            secret: sessionSecret,
            name: 'sessionId',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: isProduction,
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/',
            },
            store,
            rolling: true,
            unset: 'destroy',
        }),
    )

    debugLog({
        message: 'Session middleware configured',
        data: {
            sessionPath,
            store: primaryStore
                ? `postgres+fallback:${isMemoryFallback ? 'memory' : 'file'}`
                : isMemoryFallback
                  ? 'memory'
                  : 'file',
        },
    })
}
