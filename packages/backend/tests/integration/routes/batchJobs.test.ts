import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupBatchJobRoutes } from '../../../src/routes/batchJobs'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { errorHandler } from '../../../src/middleware/errorHandler'

jest.mock('@lucky/shared/services', () => ({
    batchJobService: {
        listByGuild: jest.fn(),
        getById: jest.fn(),
        markCancelled: jest.fn(),
    },
    serverLogService: {
        createLog: jest.fn(),
    },
    redisClient: {
        get: jest.fn(),
    },
}))

jest.mock('../../../src/middleware/auth', () => {
    return {
        requireAuth: (_req: any, _res: any, next: any) => next(),
    }
})

jest.mock('../../../src/middleware/guildAccess', () => {
    return {
        requireGuildModuleAccess:
            (_module: string, _mode?: string) =>
            (_req: any, _res: any, next: any) =>
                next(),
    }
})

const MOCK_GUILD_ID = '123456789012345678'
const MOCK_JOB_ID = 'job-test-123'
const MOCK_USER_ID = '987654321098765432'

const MOCK_BATCH_JOB = {
    id: MOCK_JOB_ID,
    guildId: MOCK_GUILD_ID,
    jobType: 'purge_batch' as const,
    status: 'pending' as const,
    initiatedBy: MOCK_USER_ID,
    sourceChannelId: MOCK_GUILD_ID,
    targetChannelId: null,
    scope: { type: 'all' as const, config: {} },
    options: null,
    totalItems: 100,
    processedItems: 0,
    failedItems: 0,
    skippedItems: 0,
    estimatedMinutes: 5,
    nextCursor: null,
    summary: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    lastProgressAt: null,
    errorLog: null,
    items: [],
}

const MOCK_BATCH_PROGRESS = {
    processed: 50,
    failed: 2,
    skipped: 1,
    total: 100,
    percentComplete: 53,
    eta: '5 minutes',
    message: 'Processing batch job: 53% complete',
    nextCursor: 'cursor-123',
}

describe('Batch Jobs Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        // Inject userId into requests for protected routes
        app.use((_req: any, _res: any, next: any) => {
            _req.userId = MOCK_USER_ID
            next()
        })
        setupBatchJobRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    describe('GET /api/guilds/:guildId/batch-jobs', () => {
        test('should list batch jobs for a guild', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            mockBatchJobService.listByGuild.mockResolvedValue([MOCK_BATCH_JOB])

            const response = await request(app)
                .get(`/api/guilds/${MOCK_GUILD_ID}/batch-jobs`)
                .expect(200)

            expect(response.body).toHaveProperty('jobs')
            expect(Array.isArray(response.body.jobs)).toBe(true)
            expect(response.body.jobs[0].id).toBe(MOCK_JOB_ID)
            expect(mockBatchJobService.listByGuild).toHaveBeenCalledWith(
                MOCK_GUILD_ID,
                expect.objectContaining({
                    limit: 20,
                    offset: 0,
                    orderBy: 'newest',
                }),
            )
        })

        test('should accept status filter', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            mockBatchJobService.listByGuild.mockResolvedValue([MOCK_BATCH_JOB])

            await request(app)
                .get(`/api/guilds/${MOCK_GUILD_ID}/batch-jobs`)
                .query({ status: 'in_progress', limit: 50, offset: 10 })
                .expect(200)

            expect(mockBatchJobService.listByGuild).toHaveBeenCalledWith(
                MOCK_GUILD_ID,
                expect.objectContaining({
                    status: 'in_progress',
                    limit: 50,
                    offset: 10,
                }),
            )
        })

        test('should return empty list if no jobs found', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            mockBatchJobService.listByGuild.mockResolvedValue([])

            const response = await request(app)
                .get(`/api/guilds/${MOCK_GUILD_ID}/batch-jobs`)
                .expect(200)

            expect(response.body.jobs).toEqual([])
        })
    })

    describe('GET /api/guilds/:guildId/batch-jobs/:jobId', () => {
        test('should retrieve a specific batch job with items', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            mockBatchJobService.getById.mockResolvedValue(MOCK_BATCH_JOB)

            const response = await request(app)
                .get(`/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}`)
                .expect(200)

            expect(response.body).toHaveProperty('job')
            expect(response.body.job.id).toBe(MOCK_JOB_ID)
            expect(mockBatchJobService.getById).toHaveBeenCalledWith(
                MOCK_JOB_ID,
                { includeItems: true },
            )
        })

        test('should return 404 if job not found', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            mockBatchJobService.getById.mockResolvedValue(null)

            const response = await request(app)
                .get(`/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}`)
                .expect(404)

            expect(response.body).toHaveProperty('error')
        })

        test('should return 404 if job belongs to different guild', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            const otherGuildJob = {
                ...MOCK_BATCH_JOB,
                guildId: 'different-guild-id',
            }
            mockBatchJobService.getById.mockResolvedValue(otherGuildJob)

            const response = await request(app)
                .get(`/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}`)
                .expect(404)

            expect(response.body).toHaveProperty('error')
        })
    })

    describe('GET /api/guilds/:guildId/batch-jobs/:jobId/progress', () => {
        test('should retrieve progress from Redis', async () => {
            const { batchJobService, redisClient } =
                await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            const mockRedisClient = redisClient as jest.Mocked<
                typeof redisClient
            >

            mockBatchJobService.getById.mockResolvedValue(MOCK_BATCH_JOB)
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_BATCH_PROGRESS),
            )

            const response = await request(app)
                .get(
                    `/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}/progress`,
                )
                .expect(200)

            expect(response.body).toHaveProperty('progress')
            expect(response.body.progress.processedItems).toBe(50)
            expect(response.body.progress.totalItems).toBe(100)
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `job:${MOCK_JOB_ID}:progress`,
            )
        })

        test('should return null progress if Redis key does not exist', async () => {
            const { batchJobService, redisClient } =
                await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            const mockRedisClient = redisClient as jest.Mocked<
                typeof redisClient
            >

            mockBatchJobService.getById.mockResolvedValue(MOCK_BATCH_JOB)
            mockRedisClient.get.mockResolvedValue(null)

            const response = await request(app)
                .get(
                    `/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}/progress`,
                )
                .expect(200)

            expect(response.body.progress).toBeNull()
        })

        test('should return 404 if job does not exist', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >

            mockBatchJobService.getById.mockResolvedValue(null)

            const response = await request(app)
                .get(
                    `/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}/progress`,
                )
                .expect(404)

            expect(response.body).toHaveProperty('error')
        })
    })

    describe('POST /api/guilds/:guildId/batch-jobs/:jobId/cancel', () => {
        test('should cancel a pending batch job', async () => {
            const { batchJobService, serverLogService } =
                await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >
            const mockServerLogService = serverLogService as jest.Mocked<
                typeof serverLogService
            >

            const cancelledJob = {
                ...MOCK_BATCH_JOB,
                status: 'cancelled' as const,
            }
            mockBatchJobService.getById.mockResolvedValue(MOCK_BATCH_JOB)
            mockBatchJobService.markCancelled.mockResolvedValue(cancelledJob)
            mockServerLogService.createLog.mockResolvedValue({} as any)

            const response = await request(app)
                .post(
                    `/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}/cancel`,
                )
                .expect(200)

            expect(response.body).toHaveProperty('job')
            expect(response.body.job.status).toBe('cancelled')
            expect(mockBatchJobService.markCancelled).toHaveBeenCalledWith(
                MOCK_JOB_ID,
            )
            expect(mockServerLogService.createLog).toHaveBeenCalled()
        })

        test('should not allow cancelling already completed jobs', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >

            const completedJob = {
                ...MOCK_BATCH_JOB,
                status: 'completed' as const,
            }
            mockBatchJobService.getById.mockResolvedValue(completedJob)

            const response = await request(app)
                .post(
                    `/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}/cancel`,
                )
                .expect(400)

            expect(response.body).toHaveProperty('error')
            expect(response.body.error).toContain('Cannot cancel a job')
        })

        test('should return 404 if job not found', async () => {
            const { batchJobService } = await import('@lucky/shared/services')
            const mockBatchJobService = batchJobService as jest.Mocked<
                typeof batchJobService
            >

            mockBatchJobService.getById.mockResolvedValue(null)

            const response = await request(app)
                .post(
                    `/api/guilds/${MOCK_GUILD_ID}/batch-jobs/${MOCK_JOB_ID}/cancel`,
                )
                .expect(404)

            expect(response.body).toHaveProperty('error')
        })
    })
})
