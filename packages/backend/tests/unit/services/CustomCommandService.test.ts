import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { ValidationError } from '@lucky/shared/errors/ValidationError'

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

jest.mock('@lucky/shared/utils/database/prismaClient', () => {
    return { getPrismaClient: () => mockPrisma }
})

jest.mock('@lucky/shared/services/redis', () => ({
    redisClient: {
        isHealthy: jest.fn(() => false),
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

import { CustomCommandService } from '@lucky/shared/services/CustomCommandService'

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

        test('should throw ValidationError when embedData is invalid', async () => {
            const invalidEmbedData = {
                title: 'x'.repeat(300), // exceeds max 256
            }

            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: invalidEmbedData,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should throw ValidationError with details when embedData fails validation', async () => {
            const invalidEmbedData = {
                color: 'invalid-hex', // not a valid hex color
            }

            try {
                await service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: invalidEmbedData,
                })
                throw new Error('Expected ValidationError to be thrown')
            } catch (error) {
                expect(error).toBeInstanceOf(ValidationError)
                const validationError = error as ValidationError
                expect(validationError.message).toBe('Invalid embed data')
                expect(validationError.details).toBeDefined()
                expect(Array.isArray(validationError.details)).toBe(true)
            }
        })

        test('should reject primitive embedData (string)', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: 'not an object' as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject primitive embedData (number)', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: 123 as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject empty embed object (no title, description, or fields)', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {} as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject title exceeding 256 characters', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {
                        title: 'x'.repeat(257),
                    } as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject description exceeding 4096 characters', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {
                        description: 'x'.repeat(4097),
                    } as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject footer exceeding 2048 characters', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {
                        title: 'Test',
                        footer: 'x'.repeat(2049),
                    } as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject more than 25 fields', async () => {
            const fields = Array.from({ length: 26 }, (_, i) => ({
                name: `Field ${i}`,
                value: `Value ${i}`,
            }))
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {
                        title: 'Test',
                        fields,
                    } as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject field with name exceeding 256 characters', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {
                        title: 'Test',
                        fields: [
                            {
                                name: 'x'.repeat(257),
                                value: 'valid',
                            },
                        ],
                    } as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject field with value exceeding 1024 characters', async () => {
            await expect(
                service.createCommand(GUILD_A, 'test', 'response', {
                    embedData: {
                        title: 'Test',
                        fields: [
                            {
                                name: 'valid',
                                value: 'x'.repeat(1025),
                            },
                        ],
                    } as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should accept valid embed with title', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'test',
                response: 'response',
                embedData: '{"title":"Valid Embed"}',
            })

            const result = await service.createCommand(
                GUILD_A,
                'test',
                'response',
                {
                    embedData: { title: 'Valid Embed' } as any,
                },
            )

            expect(result.id).toBe('cmd-1')
            expect(mockPrisma.customCommand.create).toHaveBeenCalled()
        })

        test('should accept valid embed with description', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'test',
                response: 'response',
                embedData: '{"description":"Valid Embed"}',
            })

            const result = await service.createCommand(
                GUILD_A,
                'test',
                'response',
                {
                    embedData: { description: 'Valid Embed' } as any,
                },
            )

            expect(result.id).toBe('cmd-1')
        })

        test('should accept valid embed with fields', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'test',
                response: 'response',
                embedData: '{"fields":[{"name":"Field","value":"Value"}]}',
            })

            const result = await service.createCommand(
                GUILD_A,
                'test',
                'response',
                {
                    embedData: {
                        fields: [{ name: 'Field', value: 'Value' }],
                    } as any,
                },
            )

            expect(result.id).toBe('cmd-1')
        })

        test('should accept null embedData (clearing embed)', async () => {
            mockPrisma.customCommand.create.mockResolvedValue({
                id: 'cmd-1',
                guildId: GUILD_A,
                name: 'test',
                response: 'response',
                embedData: null,
            })

            const result = await service.createCommand(
                GUILD_A,
                'test',
                'response',
                {
                    embedData: null,
                },
            )

            expect(result.id).toBe('cmd-1')
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

        test('should reject primitive embedData (string) in update', async () => {
            await expect(
                service.updateCommand(GUILD_A, 'hello', {
                    embedData: 'not an object' as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should allow clearing embedData with null', async () => {
            mockPrisma.customCommand.update.mockResolvedValue({
                id: 'cmd-1',
                name: 'hello',
                embedData: null,
            })

            const result = await service.updateCommand(GUILD_A, 'hello', {
                embedData: null,
            })

            expect(result.id).toBe('cmd-1')
            expect(mockPrisma.customCommand.update).toHaveBeenCalledWith({
                where: {
                    guildId_name: { guildId: GUILD_A, name: 'hello' },
                },
                data: { embedData: null },
            })
        })

        test('should reject primitive embedData (number) in update', async () => {
            await expect(
                service.updateCommand(GUILD_A, 'hello', {
                    embedData: 123 as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should validate embedData when updating with valid object', async () => {
            mockPrisma.customCommand.update.mockResolvedValue({
                id: 'cmd-1',
                name: 'hello',
                embedData: '{"title":"Updated"}',
            })

            const result = await service.updateCommand(GUILD_A, 'hello', {
                embedData: { title: 'Updated' } as any,
            })

            expect(result.id).toBe('cmd-1')
        })

        test('should reject invalid embedData (empty object) in update', async () => {
            await expect(
                service.updateCommand(GUILD_A, 'hello', {
                    embedData: {} as any,
                }),
            ).rejects.toThrow(ValidationError)
        })

        test('should reject title exceeding limits in update', async () => {
            await expect(
                service.updateCommand(GUILD_A, 'hello', {
                    embedData: { title: 'x'.repeat(257) } as any,
                }),
            ).rejects.toThrow(ValidationError)
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
