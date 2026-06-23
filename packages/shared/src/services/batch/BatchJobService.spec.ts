import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockGetPrismaClient = jest.fn()

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
}))

import { BatchJobService } from './BatchJobService'

describe('BatchJobService', () => {
    let service: BatchJobService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new BatchJobService()
    })

    describe('create', () => {
        it('creates a new batch job with pending status', async () => {
            const jobData = {
                id: 'job-1',
                guildId: 'guild-1',
                jobType: 'channel_move_batch',
                initiatedBy: 'user-1',
                scope: { type: 'all', config: {} },
                totalItems: 100,
                estimatedMinutes: 30,
                status: 'pending',
                sourceChannelId: 'chan-src',
                targetChannelId: 'chan-dst',
                options: { reason: 'cleanup' },
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    create: jest.fn().mockResolvedValue(jobData),
                },
            })

            const result = await service.create({
                guildId: 'guild-1',
                jobType: 'channel_move_batch',
                initiatedBy: 'user-1',
                sourceChannelId: 'chan-src',
                targetChannelId: 'chan-dst',
                scope: { type: 'all', config: {} },
                options: { reason: 'cleanup' },
                totalItems: 100,
                estimatedMinutes: 30,
            })

            expect(result.status).toBe('pending')
            expect(result.totalItems).toBe(100)
        })
    })

    describe('getById', () => {
        it('retrieves a job by ID with items', async () => {
            const jobData = {
                id: 'job-1',
                guildId: 'guild-1',
                status: 'in_progress',
                items: [{ id: 'item-1', targetId: 'msg-1', status: 'success' }],
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    findUnique: jest.fn().mockResolvedValue(jobData),
                },
            })

            const result = await service.getById('job-1')
            expect(result?.id).toBe('job-1')
            expect(result?.items).toHaveLength(1)
        })

        it('returns null if job not found', async () => {
            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    findUnique: jest.fn().mockResolvedValue(null),
                },
            })

            const result = await service.getById('nonexistent')
            expect(result).toBeNull()
        })
    })

    describe('listByGuild', () => {
        it('lists jobs for a guild with pagination', async () => {
            const jobs = [
                { id: 'job-1', guildId: 'guild-1', status: 'completed' },
                { id: 'job-2', guildId: 'guild-1', status: 'pending' },
            ]

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    findMany: jest.fn().mockResolvedValue(jobs),
                },
            })

            const result = await service.listByGuild('guild-1', {
                limit: 20,
                offset: 0,
            })

            expect(result).toHaveLength(2)
        })

        it('filters by status', async () => {
            const jobs = [
                { id: 'job-1', guildId: 'guild-1', status: 'pending' },
            ]

            // @ts-ignore
            // @ts-ignore
            const mockFindMany = jest.fn().mockResolvedValue(jobs)
            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    findMany: mockFindMany,
                },
            })

            await service.listByGuild('guild-1', { status: 'pending' })

            expect(mockFindMany).toHaveBeenCalled()
        })
    })

    describe('markInProgress', () => {
        it('updates job status to in_progress', async () => {
            const updatedJob = {
                id: 'job-1',
                status: 'in_progress',
                startedAt: new Date(),
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    update: jest.fn().mockResolvedValue(updatedJob),
                },
            })

            const result = await service.markInProgress('job-1')

            expect(result.status).toBe('in_progress')
            expect(result.startedAt).toBeDefined()
        })
    })

    describe('markCompleted', () => {
        it('updates job status to completed', async () => {
            const updatedJob = {
                id: 'job-1',
                status: 'completed',
                completedAt: new Date(),
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    update: jest.fn().mockResolvedValue(updatedJob),
                },
            })

            const result = await service.markCompleted('job-1')

            expect(result.status).toBe('completed')
            expect(result.completedAt).toBeDefined()
        })
    })

    describe('markCancelled', () => {
        it('updates job status to cancelled', async () => {
            const updatedJob = {
                id: 'job-1',
                status: 'cancelled',
                completedAt: new Date(),
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    update: jest.fn().mockResolvedValue(updatedJob),
                },
            })

            const result = await service.markCancelled('job-1')

            expect(result.status).toBe('cancelled')
        })
    })

    describe('markFailed', () => {
        it('updates job status to failed with error log', async () => {
            const updatedJob = {
                id: 'job-1',
                status: 'failed',
                completedAt: new Date(),
                errorLog: 'Connection lost',
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    update: jest.fn().mockResolvedValue(updatedJob),
                },
            })

            const result = await service.markFailed('job-1', 'Connection lost')

            expect(result.status).toBe('failed')
            expect(result.errorLog).toBe('Connection lost')
        })
    })

    describe('checkpoint', () => {
        it('updates progress counters and nextCursor', async () => {
            const updatedJob = {
                id: 'job-1',
                processedItems: 50,
                failedItems: 2,
                skippedItems: 1,
                nextCursor: 'msg-50',
                lastProgressAt: new Date(),
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    update: jest.fn().mockResolvedValue(updatedJob),
                },
            })

            const result = await service.checkpoint('job-1', {
                processedItems: 50,
                failedItems: 2,
                skippedItems: 1,
                nextCursor: 'msg-50',
            })

            expect(result.processedItems).toBe(50)
            expect(result.nextCursor).toBe('msg-50')
        })
    })

    describe('recordItem', () => {
        it('creates a batch job item record', async () => {
            const itemData = {
                id: 'item-1',
                jobId: 'job-1',
                targetId: 'msg-123',
                status: 'success',
                error: null,
                resultMetadata: { movedToUrl: 'https://example.com' },
                attemptedAt: new Date(),
            }

            mockGetPrismaClient.mockReturnValue({
                batchJobItem: {
                    // @ts-ignore
                    create: jest.fn().mockResolvedValue(itemData),
                },
            })

            const result = await service.recordItem('job-1', {
                targetId: 'msg-123',
                status: 'success',
                resultMetadata: { movedToUrl: 'https://example.com' },
            })

            expect(result.status).toBe('success')
            expect(result.targetId).toBe('msg-123')
        })
    })

    describe('setSummary', () => {
        it('sets the final summary on a job', async () => {
            const summary = {
                movedCount: 100,
                failedCount: 2,
                totalDuration: '2m 30s',
            }
            const updatedJob = {
                id: 'job-1',
                summary,
            }

            mockGetPrismaClient.mockReturnValue({
                batchJob: {
                    // @ts-ignore
                    update: jest.fn().mockResolvedValue(updatedJob),
                },
            })

            const result = await service.setSummary('job-1', summary)

            expect(result.summary).toEqual(summary)
        })
    })
})
