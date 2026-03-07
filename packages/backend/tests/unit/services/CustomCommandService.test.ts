import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    customCommand: {
        create: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        findMany: jest.fn<any>(),
        update: jest.fn<any>(),
        delete: jest.fn<any>(),
        count: jest.fn<any>(),
        groupBy: jest.fn<any>(),
    },
}

jest.mock('@nexus/shared/utils/database/prismaHelpers', () => ({
    typePrisma: (client: any) => client,
}))

jest.mock('@nexus/shared/utils/database/prismaClient', () => {
    return { getPrismaClient: () => mockPrisma }
})

import { CustomCommandService } from '@nexus/shared/services/CustomCommandService'

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
                embedData: null,
            }
            mockPrisma.customCommand.findUnique.mockResolvedValue(cmd)

            const result = await service.getCommand(GUILD_A, 'hello')

            expect(result).toEqual(cmd)
            expect(mockPrisma.customCommand.findUnique).toHaveBeenCalledWith({
                where: {
                    guildId_name: { guildId: GUILD_A, name: 'hello' },
                },
            })
        })

        test('should return null for non-existent command', async () => {
            mockPrisma.customCommand.findUnique.mockResolvedValue(null)

            const result = await service.getCommand(GUILD_A, 'nonexistent')

            expect(result).toBeNull()
        })

        test('should isolate commands per guild', async () => {
            mockPrisma.customCommand.findUnique
                .mockResolvedValueOnce({
                    name: 'hello',
                    guildId: GUILD_A,
                    embedData: null,
                })
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
                orderBy: { useCount: 'desc' },
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
            mockPrisma.customCommand.update.mockResolvedValue({
                id: 'cmd-1',
                name: 'hello',
                response: 'Updated response',
            })

            const result = await service.updateCommand(GUILD_A, 'hello', {
                response: 'Updated response',
            })

            expect(result.response).toBe('Updated response')
            expect(mockPrisma.customCommand.update).toHaveBeenCalledWith({
                where: {
                    guildId_name: { guildId: GUILD_A, name: 'hello' },
                },
                data: { response: 'Updated response' },
            })
        })
    })

    describe('deleteCommand', () => {
        test('should delete command by guild and name', async () => {
            mockPrisma.customCommand.delete.mockResolvedValue({
                id: 'cmd-1',
            })

            await service.deleteCommand(GUILD_A, 'hello')

            expect(mockPrisma.customCommand.delete).toHaveBeenCalledWith({
                where: {
                    guildId_name: { guildId: GUILD_A, name: 'hello' },
                },
            })
        })
    })

    describe('incrementUsage', () => {
        test('should increment use count and update lastUsed', async () => {
            mockPrisma.customCommand.update.mockResolvedValue({
                id: 'cmd-1',
                useCount: 5,
            })

            await service.incrementUsage(GUILD_A, 'hello')

            expect(mockPrisma.customCommand.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        guildId_name: {
                            guildId: GUILD_A,
                            name: 'hello',
                        },
                    },
                    data: expect.objectContaining({
                        useCount: { increment: 1 },
                    }),
                }),
            )
        })
    })

    describe('getStats', () => {
        test('should return command statistics for a guild', async () => {
            mockPrisma.customCommand.findMany.mockResolvedValue([
                {
                    name: 'popular',
                    useCount: 100,
                    createdAt: new Date(),
                },
            ])

            const result = await service.getStats(GUILD_A)

            expect(result).toBeDefined()
            expect(result.totalCommands).toBe(1)
            expect(result.totalUses).toBe(100)
        })
    })
})
