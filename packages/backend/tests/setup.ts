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

jest.mock('express-session', () => {
    const mockSession = jest.fn(
        () => (req: unknown, res: unknown, next: () => void) => {
            next()
        },
    )
    return mockSession
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

jest.mock('@lukbot/shared/utils/database/prismaClient', () => ({
    prisma: {
        $connect: jest.fn(),
        $disconnect: jest.fn(),
    },
}))

jest.mock('@lukbot/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn(() => true),
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        ping: jest.fn(() => Promise.resolve('PONG')),
    },
}))

jest.mock('@lukbot/shared/utils', () => ({
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
