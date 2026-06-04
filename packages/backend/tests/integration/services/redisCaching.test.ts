import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockRedisClient = {
    isHealthy: jest.fn<() => boolean>(),
    get: jest.fn<(key: string) => Promise<string | null>>(),
    set: jest.fn<(key: string, value: string) => Promise<boolean>>(),
    setex: jest.fn<
        (key: string, ttl: number, value: string) => Promise<boolean>
    >(),
    del: jest.fn<(key: string) => Promise<boolean>>(),
}

jest.mock('@lucky/shared/services/redis/index', () => ({
    redisClient: mockRedisClient,
    RedisClient: jest.fn(),
}))

const mockPrisma = {
    customCommand: {
        findUnique: jest.fn<any>(),
        create: jest.fn<any>(),
        update: jest.fn<any>(),
        delete: jest.fn<any>(),
        findMany: jest.fn<any>(),
    },
    moderationSettings: {
        findUnique: jest.fn<any>(),
        create: jest.fn<any>(),
        upsert: jest.fn<any>(),
    },
}

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

jest.mock('@lucky/shared/utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services/embedValidation', () => ({}))

jest.mock('@lucky/shared/services/ModerationService', () => ({}))

describe('Redis Caching Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRedisClient.isHealthy.mockReturnValue(true)
        mockRedisClient.setex.mockResolvedValue(true)
        mockRedisClient.del.mockResolvedValue(true)
    })

    describe('CustomCommandService caching', () => {
        let service: any

        beforeEach(async () => {
            const mod =
                await import('@lucky/shared/services/CustomCommandService')
            service = new mod.CustomCommandService()
        })

        const GUILD = '111111111111111111'
        const CMD_NAME = 'hello'
        const CACHE_KEY = `cmd:${GUILD}:${CMD_NAME}`

        test('returns cached command on cache hit', async () => {
            const cached = {
                name: CMD_NAME,
                response: 'Hello!',
                guildId: GUILD,
            }
            mockRedisClient.get.mockResolvedValue(JSON.stringify(cached))

            const result = await service.getCommand(GUILD, CMD_NAME)

            expect(result).toEqual(cached)
            expect(mockRedisClient.get).toHaveBeenCalledWith(CACHE_KEY)
            expect(mockPrisma.customCommand.findUnique).not.toHaveBeenCalled()
        })

        test('returns null from cache when cached as null', async () => {
            mockRedisClient.get.mockResolvedValue(JSON.stringify(null))

            const result = await service.getCommand(GUILD, CMD_NAME)

            expect(result).toBeNull()
            expect(mockPrisma.customCommand.findUnique).not.toHaveBeenCalled()
        })

        test('queries DB on cache miss and caches result', async () => {
            mockRedisClient.get.mockResolvedValue(null)
            const dbCommand = {
                name: CMD_NAME,
                response: 'World!',
                guildId: GUILD,
                embedData: null,
            }
            mockPrisma.customCommand.findUnique.mockResolvedValue(dbCommand)

            const result = await service.getCommand(GUILD, CMD_NAME)

            expect(result).toEqual({ ...dbCommand, embedData: null })
            expect(mockPrisma.customCommand.findUnique).toHaveBeenCalled()
            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                CACHE_KEY,
                300,
                expect.any(String),
            )
        })

        test('caches null when command not in DB', async () => {
            mockRedisClient.get.mockResolvedValue(null)
            mockPrisma.customCommand.findUnique.mockResolvedValue(null)

            const result = await service.getCommand(GUILD, CMD_NAME)

            expect(result).toBeNull()
            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                CACHE_KEY,
                300,
                'null',
            )
        })

        test('invalidates cache on create', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                name: CMD_NAME,
            })

            await service.createCommand(GUILD, CMD_NAME, 'response')

            expect(mockRedisClient.del).toHaveBeenCalledWith(CACHE_KEY)
        })

        test('invalidates cache on update', async () => {
            mockPrisma.customCommand.update.mockResolvedValue({
                name: CMD_NAME,
            })

            await service.updateCommand(GUILD, CMD_NAME, {
                response: 'new',
            })

            expect(mockRedisClient.del).toHaveBeenCalledWith(CACHE_KEY)
        })

        test('invalidates cache on delete', async () => {
            mockPrisma.customCommand.delete.mockResolvedValue({
                name: CMD_NAME,
            })

            await service.deleteCommand(GUILD, CMD_NAME)

            expect(mockRedisClient.del).toHaveBeenCalledWith(CACHE_KEY)
        })

        test('skips cache when redis unhealthy', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)
            const dbCommand = {
                name: CMD_NAME,
                response: 'test',
                guildId: GUILD,
                embedData: null,
            }
            mockPrisma.customCommand.findUnique.mockResolvedValue(dbCommand)

            await service.getCommand(GUILD, CMD_NAME)

            expect(mockRedisClient.get).not.toHaveBeenCalled()
            expect(mockPrisma.customCommand.findUnique).toHaveBeenCalled()
            expect(mockRedisClient.setex).not.toHaveBeenCalled()
        })

        test('falls back to DB on cache read error', async () => {
            mockRedisClient.get.mockRejectedValue(new Error('connection'))
            const dbCommand = {
                name: CMD_NAME,
                response: 'fallback',
                guildId: GUILD,
                embedData: null,
            }
            mockPrisma.customCommand.findUnique.mockResolvedValue(dbCommand)

            const result = await service.getCommand(GUILD, CMD_NAME)

            expect(result).toEqual({ ...dbCommand, embedData: null })
        })
    })
})
