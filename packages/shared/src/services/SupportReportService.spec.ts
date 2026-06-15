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

            const createMock = jest
                .fn<(args: unknown) => Promise<{ id: string }>>()
                .mockResolvedValue(newReport)
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

        it('rejects an image with a disallowed mime type', async () => {
            await expect(
                service.create({
                    context: 'bad image',
                    surface: 'web',
                    image: Buffer.from('data'),
                    imageMimeType: 'image/gif',
                }),
            ).rejects.toThrow('Invalid support image')
        })

        it('returns the original id with deduped on a replayed submissionKey (#1319)', async () => {
            const p2002 = Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
            })
            const createMock = jest
                .fn<(args: unknown) => Promise<{ id: string }>>()
                .mockRejectedValue(p2002)
            const findUniqueMock = jest
                .fn<(args: unknown) => Promise<{ id: string } | null>>()
                .mockResolvedValue({ id: 'report-original' })
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    create: createMock,
                    findUnique: findUniqueMock,
                },
            })

            const result = await service.create({
                context: 'Error occurred',
                surface: 'web',
                submissionKey: 'sub-key-123',
            })

            expect(result).toEqual({ id: 'report-original', deduped: true })
            expect(findUniqueMock).toHaveBeenCalledWith({
                where: { submissionKey: 'sub-key-123' },
                select: { id: true },
            })
        })

        it('rethrows P2002 when no submissionKey was provided', async () => {
            const p2002 = Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
            })
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    create: jest
                        .fn<(args: unknown) => Promise<{ id: string }>>()
                        .mockRejectedValue(p2002),
                },
            })

            await expect(
                service.create({ context: 'Error occurred', surface: 'web' }),
            ).rejects.toThrow('Unique constraint failed')
        })

        it('rethrows P2002 when the original row vanished before lookup', async () => {
            const p2002 = Object.assign(new Error('Unique constraint failed'), {
                code: 'P2002',
            })
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    create: jest
                        .fn<(args: unknown) => Promise<{ id: string }>>()
                        .mockRejectedValue(p2002),
                    findUnique: jest
                        .fn<(args: unknown) => Promise<null>>()
                        .mockResolvedValue(null),
                },
            })

            await expect(
                service.create({
                    context: 'Error occurred',
                    surface: 'web',
                    submissionKey: 'sub-key-123',
                }),
            ).rejects.toThrow('Unique constraint failed')
        })

        it('persists a provided submissionKey verbatim', async () => {
            const createMock = jest
                .fn<(args: unknown) => Promise<{ id: string }>>()
                .mockResolvedValue({ id: 'report-sk' })
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { create: createMock },
            })

            await service.create({
                context: 'Error occurred',
                surface: 'web',
                submissionKey: 'sub-key-xyz',
            })

            expect(createMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        submissionKey: 'sub-key-xyz',
                    }),
                }),
            )
        })

        it('rethrows when the thrown value is not an Error instance', async () => {
            // A plain object (not instanceof Error) must NOT be treated as a
            // P2002 dedup — the guard requires a real Error.
            const notAnError = { code: 'P2002' }
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    create: jest
                        .fn<(args: unknown) => Promise<{ id: string }>>()
                        .mockRejectedValue(notAnError),
                    findUnique: jest
                        .fn<(args: unknown) => Promise<{ id: string }>>()
                        .mockResolvedValue({ id: 'should-not-be-used' }),
                },
            })

            await expect(
                service.create({
                    context: 'Error occurred',
                    surface: 'web',
                    submissionKey: 'sub-key-123',
                }),
            ).rejects.toEqual({ code: 'P2002' })
        })

        it('rethrows a non-P2002 error code instead of deduping', async () => {
            const p2003 = Object.assign(
                new Error('Foreign key constraint failed'),
                { code: 'P2003' },
            )
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: {
                    create: jest
                        .fn<(args: unknown) => Promise<{ id: string }>>()
                        .mockRejectedValue(p2003),
                    findUnique: jest
                        .fn<(args: unknown) => Promise<{ id: string }>>()
                        .mockResolvedValue({ id: 'should-not-be-used' }),
                },
            })

            await expect(
                service.create({
                    context: 'Error occurred',
                    surface: 'web',
                    submissionKey: 'sub-key-123',
                }),
            ).rejects.toThrow('Foreign key constraint failed')
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

        it('queries findUnique by the given id', async () => {
            const findUniqueMock = jest
                .fn<(args: unknown) => Promise<null>>()
                .mockResolvedValue(null)
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findUnique: findUniqueMock },
            })

            await service.get('report-42')

            expect(findUniqueMock).toHaveBeenCalledWith({
                where: { id: 'report-42' },
            })
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
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list({ take: 50 })

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 50 }),
            )
        })

        it('omits image bytes and orders with a stable id tiebreaker', async () => {
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list()

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    omit: { image: true },
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                }),
            )
        })

        it('bounds take to maximum of 100', async () => {
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
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
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
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

        it('paginates with a cursor and skips the cursor row', async () => {
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list({ cursor: 'cur-1' })

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    cursor: { id: 'cur-1' },
                    skip: 1,
                }),
            )
        })

        it('applies default take of 20 when not specified', async () => {
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list()

            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 20 }),
            )
        })

        it('clamps non-finite or non-positive take to a valid bound', async () => {
            const findMany = jest
                .fn<(args: unknown) => Promise<Array<{ id: string }>>>()
                .mockResolvedValue([])
            // @ts-ignore - partial prisma client mock
            mockGetPrismaClient.mockReturnValue({
                supportReport: { findMany },
            })

            await service.list({ take: Number.NaN })
            expect(findMany).toHaveBeenLastCalledWith(
                expect.objectContaining({ take: 20 }),
            )

            await service.list({ take: 0 })
            expect(findMany).toHaveBeenLastCalledWith(
                expect.objectContaining({ take: 1 }),
            )

            await service.list({ take: -5 })
            expect(findMany).toHaveBeenLastCalledWith(
                expect.objectContaining({ take: 1 }),
            )
        })
    })
})
