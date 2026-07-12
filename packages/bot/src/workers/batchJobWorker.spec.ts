import { describe, expect, it, jest } from '@jest/globals'

type ProcessorFn = (job: { data: { jobId: string } }) => Promise<unknown>

function makeModule(opts: {
    sharedRedis?: object | null
    bullmqRedisCtor?: jest.Mock | null
    bullmqRedisFails?: boolean
    dbJob?: object | null
    executorExecute?: jest.Mock
    executorMissing?: boolean
    executorRegistrationThrows?: boolean
    workerCtorThrows?: boolean
    checkpointThrows?: boolean
}) {
    const {
        sharedRedis = { setex: jest.fn().mockResolvedValue('OK') },
        bullmqRedisCtor = undefined,
        bullmqRedisFails = false,
        dbJob = null,
        executorExecute,
        executorMissing = false,
        executorRegistrationThrows = false,
        workerCtorThrows = false,
        checkpointThrows = false,
    } = opts

    const infoLog = jest.fn()
    const errorLog = jest.fn()
    const debugLog = jest.fn()

    const mockCheckpoint = checkpointThrows
        ? jest.fn().mockRejectedValue(new Error('DB error'))
        : jest.fn().mockResolvedValue(undefined)
    const mockMarkInProgress = jest.fn().mockResolvedValue(undefined)
    const mockMarkCompleted = jest.fn().mockResolvedValue(undefined)
    const mockMarkFailed = jest.fn().mockResolvedValue(undefined)
    const mockSetSummary = jest.fn().mockResolvedValue(undefined)
    const mockGetById = jest.fn().mockResolvedValue(dbJob)

    const mockExecute =
        executorExecute ?? jest.fn().mockResolvedValue({ moved: 5 })
    const mockExecutor = executorMissing
        ? null
        : { jobType: 'bulk_move_messages', execute: mockExecute }

    const mockGetExecutor = jest.fn().mockReturnValue(mockExecutor)
    const mockRegisterExecutor = executorRegistrationThrows
        ? jest.fn().mockImplementation(() => {
              throw new Error('registration failed')
          })
        : jest.fn()

    const mockWorkerOn = jest.fn()
    const mockWorkerClose = jest.fn().mockResolvedValue(undefined)

    // BullMQ redis instance mock (with disconnect method)
    const mockBullmqRedisDisconnect = jest.fn().mockResolvedValue(undefined)
    const mockBullmqRedis = bullmqRedisFails
        ? null
        : {
              disconnect: mockBullmqRedisDisconnect,
          }

    const MockRedis =
        bullmqRedisCtor ?? jest.fn().mockReturnValue(mockBullmqRedis)

    let capturedProcessor: ProcessorFn | null = null
    const MockWorker = workerCtorThrows
        ? jest.fn(() => {
              throw new Error('Worker failed')
          })
        : jest
              .fn()
              .mockImplementation((_name: string, processor: ProcessorFn) => {
                  capturedProcessor = processor
                  return { on: mockWorkerOn, close: mockWorkerClose }
              })

    const MockChannelMoveBatchExecutor = jest.fn().mockImplementation(() => ({
        jobType: 'bulk_move_messages',
        execute: mockExecute,
    }))

    const MockBulkKickExecutor = jest.fn().mockImplementation(() => ({
        jobType: 'bulk_kick',
        execute: mockExecute,
    }))

    let mod: {
        startBatchJobWorker: () => Promise<void>
        stopBatchJobWorker: () => Promise<void>
    }

    jest.isolateModules(() => {
        jest.doMock('ioredis', () => MockRedis)
        jest.doMock('@lucky/shared/services', () => ({
            redisClient: { getClient: () => sharedRedis },
        }))
        jest.doMock('@lucky/shared/services/batch', () => ({
            batchJobService: {
                getById: mockGetById,
                markInProgress: mockMarkInProgress,
                markCompleted: mockMarkCompleted,
                markFailed: mockMarkFailed,
                setSummary: mockSetSummary,
                checkpoint: mockCheckpoint,
            },
        }))
        jest.doMock('@lucky/shared/utils', () => ({
            infoLog,
            errorLog,
            debugLog,
        }))
        jest.doMock('@lucky/shared/config', () => ({
            ENVIRONMENT_CONFIG: {
                REDIS: {
                    HOST: 'localhost',
                    PORT: 6379,
                    PASSWORD: undefined,
                    DB: 0,
                },
            },
        }))
        jest.doMock('./executorRegistry', () => ({
            getExecutor: mockGetExecutor,
            registerExecutor: mockRegisterExecutor,
        }))
        jest.doMock('bullmq', () => ({ Worker: MockWorker }))
        jest.doMock(
            '../functions/moderation/batch/channelMoveExecutor',
            () => ({
                ChannelMoveBatchExecutor: MockChannelMoveBatchExecutor,
            }),
        )
        jest.doMock('../functions/moderation/batch/bulkKickExecutor', () => ({
            BulkKickExecutor: MockBulkKickExecutor,
        }))
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('./batchJobWorker')
    })

    return {
        mod: mod!,
        capturedProcessor: () => capturedProcessor,
        MockWorker,
        MockRedis,
        mockBullmqRedis,
        mockBullmqRedisDisconnect,
        mockWorkerClose,
        mockWorkerOn,
        mockGetById,
        mockMarkInProgress,
        mockMarkCompleted,
        mockMarkFailed,
        mockSetSummary,
        mockCheckpoint,
        mockGetExecutor,
        mockRegisterExecutor,
        errorLog,
        infoLog,
    }
}

function makeJob(jobId = 'job-abc') {
    return { data: { jobId }, id: jobId }
}

describe('batchJobWorker', () => {
    describe('startBatchJobWorker', () => {
        it('returns early and logs error when redis is unavailable', async () => {
            const { mod, MockWorker, errorLog } = makeModule({
                sharedRedis: null,
            })
            await mod.startBatchJobWorker()
            expect(MockWorker).not.toHaveBeenCalled()
            expect(errorLog).toHaveBeenCalled()
        })

        it('creates BullMQ redis connection with maxRetriesPerRequest: null', async () => {
            const { mod, MockRedis } = makeModule({})
            await mod.startBatchJobWorker()
            expect(MockRedis).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxRetriesPerRequest: null,
                }),
            )
        })

        it('registers executor and creates Worker when redis is available', async () => {
            const { mod, MockWorker, mockBullmqRedis, mockRegisterExecutor } =
                makeModule({})
            await mod.startBatchJobWorker()
            expect(mockRegisterExecutor).toHaveBeenCalled()
            expect(MockWorker).toHaveBeenCalledWith(
                'batch-jobs',
                expect.any(Function),
                { connection: mockBullmqRedis, concurrency: 1 },
            )
        })

        it('returns early and logs error when executor registration throws', async () => {
            const { mod, MockWorker, errorLog } = makeModule({
                executorRegistrationThrows: true,
            })
            await mod.startBatchJobWorker()
            expect(MockWorker).not.toHaveBeenCalled()
            expect(errorLog).toHaveBeenCalled()
        })

        it('logs error when Worker constructor throws', async () => {
            const { mod, errorLog } = makeModule({ workerCtorThrows: true })
            await mod.startBatchJobWorker()
            expect(errorLog).toHaveBeenCalled()
        })

        it('wires up completed and failed event handlers', async () => {
            const { mod, mockWorkerOn } = makeModule({})
            await mod.startBatchJobWorker()
            const events = mockWorkerOn.mock.calls.map((c: unknown[]) => c[0])
            expect(events).toContain('completed')
            expect(events).toContain('failed')
        })
    })

    describe('stopBatchJobWorker', () => {
        it('does nothing when no worker is active', async () => {
            const { mod, mockWorkerClose } = makeModule({ sharedRedis: null })
            await mod.stopBatchJobWorker()
            expect(mockWorkerClose).not.toHaveBeenCalled()
        })

        it('closes the worker when active', async () => {
            const { mod, mockWorkerClose } = makeModule({})
            await mod.startBatchJobWorker()
            await mod.stopBatchJobWorker()
            expect(mockWorkerClose).toHaveBeenCalled()
        })

        it('logs error when close throws', async () => {
            const { mod, mockWorkerClose, errorLog } = makeModule({})
            mockWorkerClose.mockRejectedValue(new Error('close error'))
            await mod.startBatchJobWorker()
            await mod.stopBatchJobWorker()
            expect(errorLog).toHaveBeenCalled()
        })

        it('disconnects the BullMQ redis connection', async () => {
            const { mod, mockBullmqRedisDisconnect } = makeModule({})
            await mod.startBatchJobWorker()
            await mod.stopBatchJobWorker()
            expect(mockBullmqRedisDisconnect).toHaveBeenCalled()
        })
    })

    describe('processBatchJob (via worker processor)', () => {
        it('throws when job not found in DB', async () => {
            const { mod, capturedProcessor, mockMarkFailed } = makeModule({
                dbJob: null,
            })
            await mod.startBatchJobWorker()
            const processor = capturedProcessor()!
            await expect(processor(makeJob())).rejects.toThrow(
                'Batch job not found',
            )
            expect(mockMarkFailed).toHaveBeenCalled()
        })

        it('throws when no executor registered for job type', async () => {
            const dbJob = {
                id: 'job-abc',
                guildId: 'g1',
                jobType: 'unknown_type',
                totalItems: 10,
                options: {},
            }
            const { mod, capturedProcessor, mockMarkFailed } = makeModule({
                dbJob,
                executorMissing: true,
            })
            await mod.startBatchJobWorker()
            const processor = capturedProcessor()!
            await expect(processor(makeJob())).rejects.toThrow(
                'No executor registered',
            )
            expect(mockMarkFailed).toHaveBeenCalled()
        })

        it('marks job completed and sets summary on success', async () => {
            const dbJob = {
                id: 'job-abc',
                guildId: 'g1',
                jobType: 'bulk_move_messages',
                totalItems: 5,
                options: {},
            }
            const {
                mod,
                capturedProcessor,
                mockMarkCompleted,
                mockMarkInProgress,
                mockSetSummary,
            } = makeModule({ dbJob })
            await mod.startBatchJobWorker()
            const processor = capturedProcessor()!
            await processor(makeJob())
            expect(mockMarkInProgress).toHaveBeenCalledWith('job-abc')
            expect(mockMarkCompleted).toHaveBeenCalledWith('job-abc')
            expect(mockSetSummary).toHaveBeenCalledWith(
                'job-abc',
                expect.any(Object),
            )
        })

        it('marks job failed when executor throws', async () => {
            const dbJob = {
                id: 'job-abc',
                guildId: 'g1',
                jobType: 'bulk_move_messages',
                totalItems: 5,
                options: {},
            }
            const failingExecute = jest
                .fn()
                .mockRejectedValue(new Error('executor crashed'))
            const { mod, capturedProcessor, mockMarkFailed } = makeModule({
                dbJob,
                executorExecute: failingExecute,
            })
            await mod.startBatchJobWorker()
            const processor = capturedProcessor()!
            await expect(processor(makeJob())).rejects.toThrow(
                'executor crashed',
            )
            expect(mockMarkFailed).toHaveBeenCalledWith(
                'job-abc',
                'executor crashed',
            )
        })
    })

    describe('onProgress (via executor boundOnProgress callback)', () => {
        it('checkpoints to DB and does not throw when redis is available', async () => {
            const fakeRedis = { setex: jest.fn().mockResolvedValue('OK') }
            const progressCapture = {
                fn: null as ((p: unknown) => Promise<void>) | null,
            }

            const captureExecute = jest
                .fn()
                .mockImplementation(
                    async (
                        _ctx: unknown,
                        onProgress: (p: unknown) => Promise<void>,
                    ) => {
                        progressCapture.fn = onProgress
                        await onProgress({
                            processed: 10,
                            failed: 0,
                            skipped: 0,
                            nextCursor: 'c1',
                        })
                        return { moved: 10 }
                    },
                )

            const dbJob = {
                id: 'job-abc',
                guildId: 'g1',
                jobType: 'bulk_move_messages',
                totalItems: 10,
                options: {},
            }
            const { mod, capturedProcessor, mockCheckpoint } = makeModule({
                dbJob,
                executorExecute: captureExecute,
                redis: fakeRedis as never,
            })
            await mod.startBatchJobWorker()
            const processor = capturedProcessor()!
            await processor(makeJob())
            expect(mockCheckpoint).toHaveBeenCalledWith(
                'job-abc',
                expect.objectContaining({ processedItems: 10 }),
            )
        })

        it('re-throws when checkpoint fails', async () => {
            const progressCapture = {
                fn: null as ((p: unknown) => Promise<void>) | null,
            }
            const captureExecute = jest
                .fn()
                .mockImplementation(
                    async (
                        _ctx: unknown,
                        onProgress: (p: unknown) => Promise<void>,
                    ) => {
                        await onProgress({
                            processed: 10,
                            failed: 0,
                            skipped: 0,
                        })
                        return {}
                    },
                )

            const dbJob = {
                id: 'job-abc',
                guildId: 'g1',
                jobType: 'bulk_move_messages',
                totalItems: 10,
                options: {},
            }
            const { mod, capturedProcessor } = makeModule({
                dbJob,
                executorExecute: captureExecute,
                checkpointThrows: true,
            })
            await mod.startBatchJobWorker()
            const processor = capturedProcessor()!
            await expect(processor(makeJob())).rejects.toThrow('DB error')
        })
    })
})
