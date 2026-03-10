import { jest } from '@jest/globals'

process.env.NODE_ENV = 'test'
process.env.CLIENT_ID = 'test-client-id'
process.env.CLIENT_SECRET = 'test-client-secret'
process.env.WEBAPP_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
process.env.WEBAPP_PORT = '3000'
process.env.WEBAPP_SESSION_SECRET = 'test-session-secret'
process.env.DEVELOPER_USER_IDS = '123456789,987654321'
process.env.REDIS_HOST = 'localhost'
process.env.REDIS_PORT = '6379'

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        connect: jest
            .fn()
            .mockRejectedValue(new Error('not available') as never),
        disconnect: jest.fn(),
        on: jest.fn(),
        status: 'wait',
    }))
})

jest.mock('connect-redis', () => ({
    RedisStore: jest.fn().mockImplementation(() => ({
        get: jest.fn(),
        set: jest.fn(),
        destroy: jest.fn(),
    })),
}))

jest.mock('express-session', () => {
    class MockStore {}

    class MockMemoryStore extends MockStore {
        get(
            _sid: string,
            callback: (error?: Error, data?: unknown) => void,
        ): void {
            callback(undefined, null)
        }

        set(
            _sid: string,
            _data: unknown,
            callback: (error?: Error) => void = () => {},
        ): void {
            callback()
        }

        destroy(
            _sid: string,
            callback: (error?: Error) => void = () => {},
        ): void {
            callback()
        }
    }

    const getCookieValue = (cookieHeader: string, cookieName: string) => {
        const match = cookieHeader.match(
            new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`),
        )

        if (!match?.[1]) {
            return undefined
        }

        const decoded = decodeURIComponent(match[1])

        if (decoded.startsWith('s:')) {
            const unsigned = decoded.slice(2).split('.')[0]
            return unsigned || undefined
        }

        return decoded
    }

    const isHttpsForwarded = (req: {
        headers?: Record<string, string | string[] | undefined>
    }) => {
        const header = req.headers?.['x-forwarded-proto']
        const value = Array.isArray(header) ? header[0] : header
        return (
            typeof value === 'string' && value.toLowerCase().includes('https')
        )
    }

    const normalizeSameSite = (value: unknown) => {
        if (value === 'none') return 'None'
        if (value === 'strict') return 'Strict'
        return 'Lax'
    }

    const sessionFactory = Object.assign(
        (options?: {
            name?: string
            cookie?: {
                secure?: boolean
                sameSite?: 'lax' | 'strict' | 'none' | boolean
                path?: string
                maxAge?: number
            }
        }) => {
            const cookieName = options?.name ?? 'connect.sid'
            const cookiePath = options?.cookie?.path ?? '/'
            const cookieSecure = Boolean(options?.cookie?.secure)
            const cookieSameSite = normalizeSameSite(options?.cookie?.sameSite)
            const cookieMaxAge = options?.cookie?.maxAge

            return (
                req: {
                    sessionID?: string
                    headers?: Record<string, string | string[] | undefined>
                    session?: {
                        save: (cb: (err?: Error) => void) => void
                        destroy: (cb: (err?: Error) => void) => void
                        cookie?: unknown
                        [k: string]: unknown
                    }
                },
                res: {
                    setHeader?: (name: string, value: string) => void
                },
                next: () => void,
            ) => {
                const cookie = req.headers?.cookie
                const cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie
                const sessionId =
                    typeof cookieHeader === 'string'
                        ? getCookieValue(cookieHeader, cookieName)
                        : undefined

                req.sessionID = sessionId
                req.session = {
                    save(cb: (err?: Error) => void) {
                        if (!req.sessionID) {
                            req.sessionID = 'mock-session-id'
                        }

                        const canSetCookie =
                            !cookieSecure || isHttpsForwarded(req)

                        if (
                            canSetCookie &&
                            typeof res.setHeader === 'function'
                        ) {
                            const encoded = encodeURIComponent(
                                `s:${req.sessionID}.mock-signature`,
                            )
                            const expiresAt =
                                typeof cookieMaxAge === 'number'
                                    ? new Date(
                                          Date.now() + cookieMaxAge,
                                      ).toUTCString()
                                    : undefined
                            const expires = expiresAt
                                ? `; Expires=${expiresAt}`
                                : ''
                            const secure = cookieSecure ? '; Secure' : ''
                            const setCookieValue =
                                `${cookieName}=${encoded}` +
                                `; Path=${cookiePath}; HttpOnly` +
                                `${secure}; SameSite=${cookieSameSite}` +
                                expires

                            res.setHeader('Set-Cookie', setCookieValue)
                        }

                        cb()
                    },
                    destroy(cb: (err?: Error) => void) {
                        cb()
                    },
                    cookie: options?.cookie ?? {},
                } as {
                    save: (cb: (err?: Error) => void) => void
                    destroy: (cb: (err?: Error) => void) => void
                    cookie: unknown
                    [k: string]: unknown
                }
                next()
            }
        },
        {
            Store: MockStore,
            MemoryStore: MockMemoryStore,
        },
    )

    return sessionFactory
})

jest.mock('chalk', () => ({
    default: {
        red: jest.fn((str: string) => str),
        green: jest.fn((str: string) => str),
        yellow: jest.fn((str: string) => str),
        blue: jest.fn((str: string) => str),
        cyan: jest.fn((str: string) => str),
        magenta: jest.fn((str: string) => str),
        white: jest.fn((str: string) => str),
        gray: jest.fn((str: string) => str),
        grey: jest.fn((str: string) => str),
        black: jest.fn((str: string) => str),
    },
}))

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-v4'),
}))

const passthrough = (_req: any, _res: any, next: any) => next()
jest.mock('../src/middleware/rateLimit', () => ({
    apiLimiter: passthrough,
    authLimiter: passthrough,
    writeLimiter: passthrough,
}))

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: jest.fn(() => ({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
    })),
    disconnectPrisma: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn(() => true),
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(() => Promise.resolve('PONG')),
    },
    featureToggleService: {
        isEnabledGlobal: jest.fn(() => true),
        isEnabledForGuild: jest.fn(() => true),
    },
    moderationService: { createCase: jest.fn(), getCase: jest.fn() },
    autoModService: { getSettings: jest.fn() },
    customCommandService: { getCommand: jest.fn() },
    autoMessageService: { getWelcomeMessage: jest.fn() },
    serverLogService: { createLog: jest.fn() },
    embedBuilderService: {},
    musicControlService: {},
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

global.fetch = jest.fn<typeof fetch>() as jest.MockedFunction<typeof fetch>

global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}

afterEach(() => {
    jest.clearAllMocks()
})
