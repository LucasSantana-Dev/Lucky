import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockFindFirst = jest.fn<any>()
const mockCreate = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockFindMany = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockUpdateMany = jest.fn<any>()
const mockFindUnique = jest.fn<any>()
const mockExecuteRaw = jest.fn<any>()
const mockTransaction = jest.fn<any>()

const mockPrismaClient = {
    embedTemplate: {
        findFirst: mockFindFirst,
        findUnique: mockFindUnique,
        create: mockCreate,
        update: mockUpdate,
        findMany: mockFindMany,
        deleteMany: mockDeleteMany,
        updateMany: mockUpdateMany,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
}

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrismaClient,
}))

jest.mock('../generated/prisma/client', () => ({
    Prisma: {
        JsonNull: null,
        InputJsonValue: {},
    },
}))

jest.mock('./embedValidation', () => ({
    validateEmbedData: jest.fn((data) => ({
        valid: true,
        errors: [],
    })),
    hexToDecimal: jest.fn((hex: string) => parseInt(hex.slice(1), 16)),
    decimalToHex: jest.fn(
        (decimal: number) => `#${decimal.toString(16).padStart(6, '0')}`,
    ),
}))

import { EmbedBuilderService } from './EmbedBuilderService'

const GUILD_ID = 'test-guild-123'

describe('EmbedBuilderService', () => {
    let service: EmbedBuilderService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new EmbedBuilderService()
    })

    describe('getTemplate', () => {
        it('finds a template by normalized lowercase name', async () => {
            const template = {
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'welcome',
                title: 'Welcome',
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 0,
                createdBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            mockFindFirst.mockResolvedValue(template)

            const result = await service.getTemplate(GUILD_ID, 'Welcome')

            expect(result).toEqual(template)
            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'welcome' },
            })
        })

        it('returns null when template not found', async () => {
            mockFindFirst.mockResolvedValue(null)

            const result = await service.getTemplate(GUILD_ID, 'NotFound')

            expect(result).toBeNull()
            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'notfound' },
            })
        })

        it('normalizes mixed-case input to lowercase', async () => {
            mockFindFirst.mockResolvedValue(null)

            await service.getTemplate(GUILD_ID, 'WeLcOmE')

            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'welcome' },
            })
        })
    })

    describe('createTemplate', () => {
        it('stores template with lowercase name and provided values', async () => {
            const embedData = {
                title: 'Welcome',
                description: 'Welcome message',
                color: '#FF0000',
            }

            const created = {
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'welcome',
                ...embedData,
                fields: undefined,
                useCount: 0,
                createdBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            mockCreate.mockResolvedValue(created)

            await service.createTemplate(
                GUILD_ID,
                'Welcome',
                embedData,
                'A welcome template',
                'user-1',
            )

            expect(mockCreate).toHaveBeenCalledWith({
                data: {
                    guildId: GUILD_ID,
                    name: 'welcome',
                    title: 'Welcome',
                    description: 'Welcome message',
                    color: '#FF0000',
                    footer: null,
                    thumbnail: null,
                    image: null,
                    fields: undefined,
                    createdBy: 'user-1',
                },
            })
        })

        it('converts undefined optional fields to null', async () => {
            const embedData = {
                title: 'Test',
            }

            mockCreate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'test',
                title: 'Test',
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: undefined,
                useCount: 0,
                createdBy: 'unknown',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.createTemplate(GUILD_ID, 'Test', embedData)

            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    description: null,
                    color: null,
                    footer: null,
                    thumbnail: null,
                    image: null,
                }),
            })
        })

        it('defaults createdBy to unknown when not provided', async () => {
            mockCreate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'test',
                title: null,
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: undefined,
                useCount: 0,
                createdBy: 'unknown',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.createTemplate(GUILD_ID, 'Test', {})

            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({ createdBy: 'unknown' }),
            })
        })

        it('preserves fields when provided', async () => {
            const fields = [{ name: 'Field1', value: 'Value1' }]
            const embedData = { title: 'Test', fields }

            mockCreate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'test',
                title: 'Test',
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields,
                useCount: 0,
                createdBy: 'unknown',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.createTemplate(GUILD_ID, 'Test', embedData)

            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({ fields }),
            })
        })
    })

    describe('upsertTemplate', () => {
        it('creates template when not found', async () => {
            const txCreate = jest.fn<any>()
            const txFindUnique = jest.fn<any>()
            const mockTx = {
                embedTemplate: {
                    findUnique: txFindUnique,
                    create: txCreate,
                    update: jest.fn<any>(),
                },
                $executeRaw: jest.fn<any>(),
            }

            txFindUnique.mockResolvedValue(null)
            txCreate.mockResolvedValue({ id: 'tmpl-1' })

            mockTransaction.mockImplementation(async (callback: any) => {
                return await callback(mockTx)
            })

            const embedData = {
                title: 'Welcome',
                description: 'Welcome message',
                color: '#FF0000',
            }

            await service.upsertTemplate(
                GUILD_ID,
                'Welcome',
                embedData,
                'user-1',
            )

            expect(txFindUnique).toHaveBeenCalledWith({
                where: {
                    guildId_name: {
                        guildId: GUILD_ID,
                        name: 'welcome',
                    },
                },
                select: { id: true },
            })

            expect(txCreate).toHaveBeenCalledWith({
                data: {
                    guildId: GUILD_ID,
                    name: 'welcome',
                    title: 'Welcome',
                    description: 'Welcome message',
                    color: '#FF0000',
                    footer: null,
                    thumbnail: null,
                    image: null,
                    fields: null,
                    createdBy: 'user-1',
                },
            })
        })

        it('updates template when already exists', async () => {
            const txFindUnique = jest.fn<any>()
            const txUpdate = jest.fn<any>()
            const mockTx = {
                embedTemplate: {
                    findUnique: txFindUnique,
                    create: jest.fn<any>(),
                    update: txUpdate,
                },
                $executeRaw: jest.fn<any>(),
            }

            txFindUnique.mockResolvedValue({ id: 'tmpl-1' })
            txUpdate.mockResolvedValue({ id: 'tmpl-1' })

            mockTransaction.mockImplementation(async (callback: any) => {
                return await callback(mockTx)
            })

            const embedData = {
                title: 'Updated',
            }

            const result = await service.upsertTemplate(
                GUILD_ID,
                'Welcome',
                embedData,
            )

            expect(result).toBe('updated')
            expect(txUpdate).toHaveBeenCalledWith({
                where: { id: 'tmpl-1' },
                data: {
                    title: 'Updated',
                    description: null,
                    color: null,
                    footer: null,
                    thumbnail: null,
                    image: null,
                    fields: null,
                },
            })
        })

        it('normalizes template name in upsert', async () => {
            const txFindUnique = jest.fn<any>()
            const mockTx = {
                embedTemplate: {
                    findUnique: txFindUnique,
                    create: jest.fn<any>(),
                    update: jest.fn<any>(),
                },
                $executeRaw: jest.fn<any>(),
            }

            txFindUnique.mockResolvedValue(null)

            mockTransaction.mockImplementation(async (callback: any) => {
                return await callback(mockTx)
            })

            await service.upsertTemplate(GUILD_ID, 'WeLcOmE', {})

            expect(txFindUnique).toHaveBeenCalledWith({
                where: {
                    guildId_name: {
                        guildId: GUILD_ID,
                        name: 'welcome',
                    },
                },
                select: { id: true },
            })
        })

        it('uses Prisma.JsonNull when fields is undefined in upsert', async () => {
            const txFindUnique = jest.fn<any>()
            const txCreate = jest.fn<any>()
            const mockTx = {
                embedTemplate: {
                    findUnique: txFindUnique,
                    create: txCreate,
                    update: jest.fn<any>(),
                },
                $executeRaw: jest.fn<any>(),
            }

            txFindUnique.mockResolvedValue(null)
            txCreate.mockResolvedValue({ id: 'tmpl-1' })

            mockTransaction.mockImplementation(async (callback: any) => {
                return await callback(mockTx)
            })

            await service.upsertTemplate(GUILD_ID, 'Test', {})

            const callArgs = txCreate.mock.calls[0][0] as any
            expect(callArgs.data.fields).toBe(null)
        })

        it('handles fields in upsert payload', async () => {
            const fields = [{ name: 'Field1', value: 'Value1' }]
            const txFindUnique = jest.fn<any>()
            const txCreate = jest.fn<any>()
            const mockTx = {
                embedTemplate: {
                    findUnique: txFindUnique,
                    create: txCreate,
                    update: jest.fn<any>(),
                },
                $executeRaw: jest.fn<any>(),
            }

            txFindUnique.mockResolvedValue(null)
            txCreate.mockResolvedValue({ id: 'tmpl-1' })

            mockTransaction.mockImplementation(async (callback: any) => {
                return await callback(mockTx)
            })

            await service.upsertTemplate(GUILD_ID, 'Test', { fields })

            const callArgs = txCreate.mock.calls[0][0] as any
            expect(callArgs.data.fields).toEqual(fields)
        })
    })

    describe('updateTemplate', () => {
        it('updates template by normalized name', async () => {
            const updates = { title: 'Updated Welcome', description: 'Updated' }

            mockUpdate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'welcome',
                ...updates,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 0,
                createdBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.updateTemplate(GUILD_ID, 'Welcome', updates)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { guildId_name: { guildId: GUILD_ID, name: 'welcome' } },
                data: updates,
            })
        })

        it('separates fields from other updates', async () => {
            const fields = [{ name: 'Field1', value: 'Value1' }]
            const updates = {
                title: 'Updated',
                description: 'Updated description',
                fields,
            }

            mockUpdate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'test',
                title: 'Updated',
                description: 'Updated description',
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields,
                useCount: 0,
                createdBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.updateTemplate(GUILD_ID, 'Test', updates)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { guildId_name: { guildId: GUILD_ID, name: 'test' } },
                data: {
                    title: 'Updated',
                    description: 'Updated description',
                    fields,
                },
            })
        })

        it('handles update without fields', async () => {
            const updates = { title: 'Updated' }

            mockUpdate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'test',
                title: 'Updated',
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 0,
                createdBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.updateTemplate(GUILD_ID, 'Test', updates)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { guildId_name: { guildId: GUILD_ID, name: 'test' } },
                data: { title: 'Updated' },
            })
        })

        it('throws formatted error on P2025 (not found)', async () => {
            const error = new Error('Record not found')
            ;(error as any).code = 'P2025'

            mockUpdate.mockRejectedValue(error)

            await expect(
                service.updateTemplate(GUILD_ID, 'NotFound', { title: 'Test' }),
            ).rejects.toThrow('Template "NotFound" not found in guild')
        })

        it('rethrows other database errors', async () => {
            const error = new Error('Database connection error')
            ;(error as any).code = 'P1000'

            mockUpdate.mockRejectedValue(error)

            await expect(
                service.updateTemplate(GUILD_ID, 'Test', { title: 'Test' }),
            ).rejects.toThrow('Database connection error')
        })

        it('handles error without code property', async () => {
            const error = new Error('Some error')

            mockUpdate.mockRejectedValue(error)

            await expect(
                service.updateTemplate(GUILD_ID, 'Test', { title: 'Test' }),
            ).rejects.toThrow('Some error')
        })

        it('handles error that is null', async () => {
            mockUpdate.mockRejectedValue(null)

            await expect(
                service.updateTemplate(GUILD_ID, 'Test', { title: 'Test' }),
            ).rejects.toEqual(null)
        })

        it('handles non-string error code', async () => {
            const error = new Error('Some error')
            ;(error as any).code = 12345

            mockUpdate.mockRejectedValue(error)

            await expect(
                service.updateTemplate(GUILD_ID, 'Test', { title: 'Test' }),
            ).rejects.toThrow('Some error')
        })
    })

    describe('deleteTemplate', () => {
        it('deletes template by normalized name', async () => {
            mockDeleteMany.mockResolvedValue({ count: 1 })

            await service.deleteTemplate(GUILD_ID, 'Welcome')

            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'welcome' },
            })
        })

        it('throws error when template not found', async () => {
            mockDeleteMany.mockResolvedValue({ count: 0 })

            await expect(
                service.deleteTemplate(GUILD_ID, 'NotFound'),
            ).rejects.toThrow('Template "NotFound" not found in guild')
        })

        it('includes guild id in error message', async () => {
            mockDeleteMany.mockResolvedValue({ count: 0 })

            await expect(
                service.deleteTemplate(GUILD_ID, 'NotFound'),
            ).rejects.toThrow(GUILD_ID)
        })

        it('normalizes name before delete', async () => {
            mockDeleteMany.mockResolvedValue({ count: 1 })

            await service.deleteTemplate(GUILD_ID, 'WeLcOmE')

            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'welcome' },
            })
        })
    })

    describe('incrementUsage', () => {
        it('increments usage count by normalized name', async () => {
            mockUpdateMany.mockResolvedValue({ count: 1 })

            await service.incrementUsage(GUILD_ID, 'Welcome')

            expect(mockUpdateMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'welcome' },
                data: { useCount: { increment: 1 } },
            })
        })

        it('normalizes template name in incrementUsage', async () => {
            mockUpdateMany.mockResolvedValue({ count: 1 })

            await service.incrementUsage(GUILD_ID, 'WeLcOmE')

            expect(mockUpdateMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID, name: 'welcome' },
                data: { useCount: { increment: 1 } },
            })
        })
    })

    describe('listTemplates', () => {
        it('lists all templates for a guild ordered by name', async () => {
            const templates = [
                {
                    id: 'tmpl-1',
                    guildId: GUILD_ID,
                    name: 'goodbye',
                    title: 'Goodbye',
                    description: null,
                    color: null,
                    footer: null,
                    thumbnail: null,
                    image: null,
                    fields: [],
                    useCount: 2,
                    createdBy: 'user-1',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'tmpl-2',
                    guildId: GUILD_ID,
                    name: 'welcome',
                    title: 'Welcome',
                    description: null,
                    color: null,
                    footer: null,
                    thumbnail: null,
                    image: null,
                    fields: [],
                    useCount: 5,
                    createdBy: 'user-1',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]
            mockFindMany.mockResolvedValue(templates)

            const result = await service.listTemplates(GUILD_ID)

            expect(result).toEqual(templates)
            expect(mockFindMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID },
                orderBy: { name: 'asc' },
            })
        })

        it('returns empty array when no templates exist', async () => {
            mockFindMany.mockResolvedValue([])

            const result = await service.listTemplates(GUILD_ID)

            expect(result).toEqual([])
            expect(mockFindMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_ID },
                orderBy: { name: 'asc' },
            })
        })
    })

    describe('validateEmbedData', () => {
        it('validates embed data correctly', () => {
            const result = service.validateEmbedData({
                title: 'Test',
            })

            expect(result).toHaveProperty('valid')
            expect(result).toHaveProperty('errors')
            expect(Array.isArray(result.errors)).toBe(true)
        })

        it('returns object with valid property', () => {
            const result = service.validateEmbedData({})

            expect(result).toHaveProperty('valid')
            expect(typeof result.valid).toBe('boolean')
        })

        it('returns object with errors array', () => {
            const result = service.validateEmbedData({})

            expect(result).toHaveProperty('errors')
            expect(Array.isArray(result.errors)).toBe(true)
        })
    })

    describe('hexToDecimal', () => {
        it('converts hex color to decimal', () => {
            const result = service.hexToDecimal('#FF0000')

            expect(typeof result).toBe('number')
            expect(result).toBeGreaterThan(0)
        })

        it('returns numeric value', () => {
            const result = service.hexToDecimal('#FF0000')

            expect(Number.isInteger(result)).toBe(true)
        })
    })

    describe('decimalToHex', () => {
        it('converts decimal color to hex string', () => {
            const result = service.decimalToHex(16711680)

            expect(typeof result).toBe('string')
            expect(result).toMatch(/^#[0-9a-fA-F]{6}$/)
        })

        it('returns string starting with hash', () => {
            const result = service.decimalToHex(16711680)

            expect(result.startsWith('#')).toBe(true)
        })
    })
})
