import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockFindFirst = jest.fn<any>()
const mockCreate = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockFindMany = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockUpdateMany = jest.fn<any>()

const mockPrismaClient = {
    embedTemplate: {
        findFirst: mockFindFirst,
        findUnique: jest.fn<any>(),
        create: mockCreate,
        update: mockUpdate,
        findMany: mockFindMany,
        deleteMany: mockDeleteMany,
        updateMany: mockUpdateMany,
    },
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

            // Caller uses uppercase; template stored as lowercase
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
        it('stores template with lowercase name', async () => {
            const embedData = {
                title: 'Welcome',
                description: 'Welcome message',
                color: '#FF0000',
            }

            mockCreate.mockResolvedValue({
                id: 'tmpl-1',
                guildId: GUILD_ID,
                name: 'welcome',
                ...embedData,
                footer: null,
                thumbnail: null,
                image: null,
                fields: undefined,
                useCount: 0,
                createdBy: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.createTemplate(
                GUILD_ID,
                'Welcome',
                embedData,
                'A welcome template',
                'user-1',
            )

            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    guildId: GUILD_ID,
                    name: 'welcome',
                }),
            })
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
            ).rejects.toThrow('not found')
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
    })
})
