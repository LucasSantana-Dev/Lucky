import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma = {
    embedTemplate: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}

jest.unstable_mockModule('@lukbot/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    prisma: mockPrisma,
}))

const { EmbedBuilderService } =
    await import('@lukbot/shared/services/EmbedBuilderService')

describe('EmbedBuilderService', () => {
    let service: InstanceType<typeof EmbedBuilderService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new EmbedBuilderService()
    })

    describe('createTemplate', () => {
        test('should create a template with embed data', async () => {
            const embedData = { title: 'Test', description: 'Hello' }
            mockPrisma.embedTemplate.create.mockResolvedValue({
                id: 'tpl-1',
                guildId: GUILD_A,
                name: 'welcome',
                embedData: JSON.stringify(embedData),
                useCount: 0,
            })

            const result = await service.createTemplate(
                GUILD_A,
                'welcome',
                embedData,
            )

            expect(result.name).toBe('welcome')
            expect(mockPrisma.embedTemplate.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        name: 'welcome',
                    }),
                }),
            )
        })
    })

    describe('getTemplate', () => {
        test('should find template by guild and name', async () => {
            const tpl = {
                id: 'tpl-1',
                guildId: GUILD_A,
                name: 'welcome',
                embedData: '{"title":"Test"}',
            }
            mockPrisma.embedTemplate.findFirst.mockResolvedValue(tpl)

            const result = await service.getTemplate(GUILD_A, 'welcome')

            expect(result).toEqual(tpl)
            expect(mockPrisma.embedTemplate.findFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, name: 'welcome' },
            })
        })

        test('should return null for non-existent template', async () => {
            mockPrisma.embedTemplate.findFirst.mockResolvedValue(null)

            const result = await service.getTemplate(GUILD_A, 'nonexistent')

            expect(result).toBeNull()
        })

        test('should isolate templates per guild (multi-server)', async () => {
            mockPrisma.embedTemplate.findFirst
                .mockResolvedValueOnce({ name: 'welcome', guildId: GUILD_A })
                .mockResolvedValueOnce(null)

            const resultA = await service.getTemplate(GUILD_A, 'welcome')
            const resultB = await service.getTemplate(GUILD_B, 'welcome')

            expect(resultA).not.toBeNull()
            expect(resultB).toBeNull()
        })
    })

    describe('listTemplates', () => {
        test('should list all templates for a guild', async () => {
            const templates = [
                { name: 'welcome', guildId: GUILD_A },
                { name: 'rules', guildId: GUILD_A },
            ]
            mockPrisma.embedTemplate.findMany.mockResolvedValue(templates)

            const result = await service.listTemplates(GUILD_A)

            expect(result).toHaveLength(2)
            expect(mockPrisma.embedTemplate.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
                orderBy: { name: 'asc' },
            })
        })

        test('should return empty array for guild with no templates', async () => {
            mockPrisma.embedTemplate.findMany.mockResolvedValue([])

            const result = await service.listTemplates(GUILD_B)

            expect(result).toHaveLength(0)
        })
    })

    describe('updateTemplate', () => {
        test('should update template data', async () => {
            mockPrisma.embedTemplate.findFirst.mockResolvedValue({
                id: 'tpl-1',
                guildId: GUILD_A,
                name: 'welcome',
            })
            mockPrisma.embedTemplate.update.mockResolvedValue({
                id: 'tpl-1',
                name: 'welcome',
                description: 'Updated desc',
            })

            const result = await service.updateTemplate(GUILD_A, 'welcome', {
                description: 'Updated desc',
            })

            expect(result.description).toBe('Updated desc')
        })
    })

    describe('deleteTemplate', () => {
        test('should delete template by guild and name', async () => {
            mockPrisma.embedTemplate.findFirst.mockResolvedValue({
                id: 'tpl-1',
                guildId: GUILD_A,
                name: 'welcome',
            })
            mockPrisma.embedTemplate.delete.mockResolvedValue({ id: 'tpl-1' })

            await service.deleteTemplate(GUILD_A, 'welcome')

            expect(mockPrisma.embedTemplate.delete).toHaveBeenCalled()
        })
    })

    describe('incrementUsage', () => {
        test('should increment use count', async () => {
            mockPrisma.embedTemplate.findFirst.mockResolvedValue({
                id: 'tpl-1',
                guildId: GUILD_A,
                name: 'welcome',
            })
            mockPrisma.embedTemplate.update.mockResolvedValue({
                id: 'tpl-1',
                useCount: 5,
            })

            await service.incrementUsage(GUILD_A, 'welcome')

            expect(mockPrisma.embedTemplate.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        useCount: { increment: 1 },
                    }),
                }),
            )
        })
    })

    describe('validateEmbedData', () => {
        test('should validate correct embed data', () => {
            const result = service.validateEmbedData({
                title: 'Test',
                description: 'Hello world',
            })

            expect(result.valid).toBe(true)
        })

        test('should reject embed data with no content', () => {
            const result = service.validateEmbedData({})

            expect(result.valid).toBe(false)
        })
    })

    describe('hexToDecimal / decimalToHex', () => {
        test('should convert hex to decimal', () => {
            expect(service.hexToDecimal('#5865F2')).toBe(5793266)
            expect(service.hexToDecimal('#FF0000')).toBe(16711680)
        })

        test('should convert decimal to hex', () => {
            expect(service.decimalToHex(5793266)).toBe('#5865F2')
            expect(service.decimalToHex(16711680)).toBe('#FF0000')
        })
    })
})
