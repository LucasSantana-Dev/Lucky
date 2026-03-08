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
        connect: jest.fn().mockRejectedValue(new Error('not available')),
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
    return function session(options?: { name?: string }) {
        const cookieName = options?.name ?? 'connect.sid'
        return (
            req: {
                sessionID?: string
                session?: {
                    save: (cb: (err?: Error) => void) => void
                    cookie?: unknown
                    [k: string]: unknown
                }
                headers?: { cookie?: string }
            },
            _res: unknown,
            next: () => void,
        ) => {
            const cookie = req.headers?.cookie ?? ''
            const match = cookie.match(new RegExp(`${cookieName}=([^;]+)`))
            if (match) {
                req.sessionID = match[1]
            }
            req.session = {
                save(cb: (err?: Error) => void) {
                    cb()
                },
                destroy(cb: (err?: Error) => void) {
                    cb()
                },
                cookie: {},
            } as {
                save: (cb: (err?: Error) => void) => void
                destroy: (cb: (err?: Error) => void) => void
                cookie: unknown
                [k: string]: unknown
            }
            next()
        }
    }
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

jest.mock('@nexus/shared/utils/database/prismaClient', () => ({
    getPrismaClient: jest.fn(() => ({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
    })),
    disconnectPrisma: jest.fn(),
}))

jest.mock('@nexus/shared/services', () => ({
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

jest.mock('@nexus/shared/utils', () => ({
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
