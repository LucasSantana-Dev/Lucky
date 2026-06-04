import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockGetPrismaClient = jest.fn()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

import { SupportReportService } from './SupportReportService'

describe('SupportReportService', () => {
    let service: SupportReportService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new SupportReportService()
    })

    describe('create', () => {
        it('persists a report and returns the id', async () => {
            const newReport = {
                id: 'report-1',
                createdAt: new Date(),
                context: 'Playback error on /play command',
                image: null,
                imageMimeType: null,
                correlationId: 'abc123xy',
                guildId: 'guild-456',
                surface: 'bot',
                errorCategory: 'playback-error',
                status: 'new',
                rateLimitKey: 'hash-abc123',
            }

            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    // @ts-ignore - jest mock resolved value type
                    create: jest.fn().mockResolvedValue(newReport),
                },
            })

            const result = await service.create({
                context: 'Playback error on /play command',
                surface: 'bot',
                guildId: 'guild-456',
                correlationId: 'abc123xy',
                errorCategory: 'playback-error',
                rateLimitKey: 'hash-abc123',
            })

            expect(result.id).toBe('report-1')
            expect(mockGetPrismaClient).toHaveBeenCalled()
        })

        it('persists report with image bytes and mimetype', async () => {
            const imageBuffer = Buffer.from('fake-image-bytes')
            const newReport = {
                id: 'report-2',
                createdAt: new Date(),
                context: 'Screenshot attached',
                image: imageBuffer,
                imageMimeType: 'image/png',
                correlationId: 'xyz789ab',
                guildId: 'guild-789',
                surface: 'web',
                errorCategory: 'ui-error',
                status: 'new',
                rateLimitKey: 'hash-xyz789',
            }

            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    // @ts-ignore - jest mock resolved value type
                    create: jest.fn().mockResolvedValue(newReport),
                },
            })

            const result = await service.create({
                context: 'Screenshot attached',
                surface: 'web',
                guildId: 'guild-789',
                image: imageBuffer,
                imageMimeType: 'image/png',
                correlationId: 'xyz789ab',
                errorCategory: 'ui-error',
            })

            expect(result.id).toBe('report-2')
        })

        it('defaults nullable fields to null', async () => {
            const newReport = {
                id: 'report-3',
                createdAt: new Date(),
                context: 'Error occurred',
                image: null,
                imageMimeType: null,
                correlationId: null,
                guildId: null,
                surface: 'bot',
                errorCategory: null,
                status: 'new',
                rateLimitKey: null,
            }

            const createMock =
                jest.fn<(args: unknown) => Promise<{ id: string }>>().mockResolvedValue(
                    newReport,
                )
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { create: createMock },
            })

            const result = await service.create({
                context: 'Error occurred',
                surface: 'bot',
            })

            expect(result.id).toBe('report-3')
            // Optional fields absent from input must be persisted as null.
            expect(createMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        image: null,
                        imageMimeType: null,
                        correlationId: null,
                        guildId: null,
                        errorCategory: null,
                        rateLimitKey: null,
                        status: 'new',
                    }),
                }),
            )
        })
    })

    describe('get', () => {
        it('returns a report when it exists', async () => {
            const report = {
                id: 'report-1',
                createdAt: new Date(),
                context: 'Test context',
                image: null,
                imageMimeType: null,
                correlationId: 'abc123xy',
                guildId: 'guild-456',
                surface: 'bot',
                errorCategory: 'test-error',
                status: 'new',
                rateLimitKey: null,
            }

            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    // @ts-ignore - jest mock resolved value type
                    findUnique: jest.fn().mockResolvedValue(report),
                },
            })

            const result = await service.get('report-1')

            expect(result).toEqual(report)
            expect(result?.id).toBe('report-1')
        })

        it('returns null when report does not exist', async () => {
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    // @ts-ignore - jest mock resolved value type
                    findUnique: jest.fn().mockResolvedValue(null),
                },
            })

            const result = await service.get('nonexistent')

            expect(result).toBeNull()
        })
    })

    describe('list', () => {
        it('returns reports in descending createdAt order', async () => {
            const reports = [
                { id: 'report-3', createdAt: new Date('2026-06-04T12:00:00Z') },
                { id: 'report-2', createdAt: new Date('2026-06-04T11:00:00Z') },
                { id: 'report-1', createdAt: new Date('2026-06-04T10:00:00Z') },
            ]

            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    // @ts-ignore - jest mock resolved value type
                    findMany: jest.fn().mockResolvedValue(reports),
                },
            })

            const result = await service.list({ take: 20 })

            expect(result).toHaveLength(3)
            expect(result[0].id).toBe('report-3')
            expect(result[1].id).toBe('report-2')
            expect(result[2].id).toBe('report-1')
        })

        it('respects the take parameter', async () => {
            const findMany =
                jest.fn<(args: unknown) => Promise<Array<{ id: string }>>>().mockResolvedValue(
                    [],
                )
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list({ take: 50 })

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 50 }),
            )
        })

        it('bounds take to maximum of 100', async () => {
            const findMany =
                jest.fn<(args: unknown) => Promise<Array<{ id: string }>>>().mockResolvedValue(
                    [],
                )
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list({ take: 200 })

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 100 }),
            )
        })

        it('filters by status when provided', async () => {
            const findMany =
                jest.fn<(args: unknown) => Promise<Array<{ id: string }>>>().mockResolvedValue(
                    [],
                )
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list({ status: 'triaged' })

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { status: 'triaged' },
                }),
            )
        })

        it('applies default take of 20 when not specified', async () => {
            const findMany =
                jest.fn<(args: unknown) => Promise<Array<{ id: string }>>>().mockResolvedValue(
                    [],
                )
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list()

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 20 }),
            )
        })
    })
})
