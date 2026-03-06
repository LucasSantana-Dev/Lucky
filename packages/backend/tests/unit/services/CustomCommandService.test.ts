import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    customCommand: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
    },
}

jest.unstable_mockModule('@lukbot/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    prisma: mockPrisma,
}))

beforeAll(async () => {
    const module = await import('@lukbot/shared/services')
    const { CustomCommandService } = module
    jest.unstable_mockModule(
        '@lukbot/shared/services/CustomCommandService',
        () => CustomCommandService,
    )
})

describe('CustomCommandService', () => {
    let service: InstanceType<typeof CustomCommandService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new CustomCommandService()
    })

    describe('createCommand', () => {
        test('should create a command with required fields', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'hello',
                response: 'Hello World!',
                useCount: 0,
            })

            const result = await service.createCommand(
                GUILD_A,
                'hello',
                'Hello World!',
            )

            expect(result.name).toBe('hello')
            expect(result.response).toBe('Hello World!')
            expect(mockPrisma.customCommand.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        name: 'hello',
                        response: 'Hello World!',
                    }),
                }),
            )
        })

        test('should create a command with optional fields', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'greet',
                response: 'Hi there!',
                description: 'A greeting command',
                createdBy: 'user-1',
            })

            await service.createCommand(GUILD_A, 'greet', 'Hi there!', {
                description: 'A greeting command',
                createdBy: 'user-1',
            })

            expect(mockPrisma.customCommand.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        description: 'A greeting command',
                        createdBy: 'user-1',
                    }),
                }),
            )
        })
    })

    describe('getCommand', () => {
        test('should find command by guild and name', async () => {
            const cmd = {
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'hello',
                response: 'Hi!',
            }
            mockPrisma.customCommand.findFirst.mockResolvedValue(cmd)

            const result = await service.getCommand(GUILD_A, 'hello')

            expect(result).toEqual(cmd)
            expect(mockPrisma.customCommand.findFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, name: 'hello' },
            })
        })

        test('should return null for non-existent command', async () => {
            mockPrisma.customCommand.findFirst.mockResolvedValue(null)

            const result = await service.getCommand(GUILD_A, 'nonexistent')

            expect(result).toBeNull()
        })

        test('should isolate commands per guild (multi-server)', async () => {
            mockPrisma.customCommand.findFirst
                .mockResolvedValueOnce({ name: 'hello', guildId: GUILD_A })
                .mockResolvedValueOnce(null)

            const resultA = await service.getCommand(GUILD_A, 'hello')
            const resultB = await service.getCommand(GUILD_B, 'hello')

            expect(resultA).not.toBeNull()
            expect(resultB).toBeNull()
        })
    })

    describe('listCommands', () => {
        test('should list all commands for a guild', async () => {
            const commands = [
                { name: 'hello', guildId: GUILD_A },
                { name: 'bye', guildId: GUILD_A },
            ]
            mockPrisma.customCommand.findMany.mockResolvedValue(commands)

            const result = await service.listCommands(GUILD_A)

            expect(result).toHaveLength(2)
            expect(mockPrisma.customCommand.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
                orderBy: { name: 'asc' },
            })
        })

        test('should return empty array for guild with no commands', async () => {
            mockPrisma.customCommand.findMany.mockResolvedValue([])

            const result = await service.listCommands(GUILD_B)

            expect(result).toHaveLength(0)
        })
    })

    describe('updateCommand', () => {
        test('should update command by guild and name', async () => {
            mockPrisma.customCommand.findFirst.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'hello',
            })
            mockPrisma.customCommand.update.mockResolvedValue({
                id: 'cmd-1',
                name: 'hello',
                response: 'Updated response',
            })

            const result = await service.updateCommand(GUILD_A, 'hello', {
                response: 'Updated response',
            })

            expect(result.response).toBe('Updated response')
        })
    })

    describe('deleteCommand', () => {
        test('should delete command by guild and name', async () => {
            mockPrisma.customCommand.findFirst.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'hello',
            })
            mockPrisma.customCommand.delete.mockResolvedValue({
                id: 'cmd-1',
            })

            await service.deleteCommand(GUILD_A, 'hello')

            expect(mockPrisma.customCommand.delete).toHaveBeenCalled()
        })
    })

    describe('incrementUsage', () => {
        test('should increment use count and update lastUsed', async () => {
            mockPrisma.customCommand.findFirst.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'hello',
            })
            mockPrisma.customCommand.update.mockResolvedValue({
                id: 'cmd-1',
                useCount: 5,
            })

            await service.incrementUsage(GUILD_A, 'hello')

            expect(mockPrisma.customCommand.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        useCount: { increment: 1 },
                    }),
                }),
            )
        })
    })

    describe('getStats', () => {
        test('should return command statistics for a guild', async () => {
            mockPrisma.customCommand.count.mockResolvedValue(10)
            mockPrisma.customCommand.findMany.mockResolvedValue([
                { name: 'popular', useCount: 100 },
            ])

            const result = await service.getStats(GUILD_A)

            expect(result).toBeDefined()
        })
    })
})
