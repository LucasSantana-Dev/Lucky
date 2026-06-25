import { describe, expect, it, jest } from '@jest/globals'

// Use isolateModules per test group to reset the module-level `queue` singleton.
function makeModule(redis: Record<string, unknown> | null) {
    const warnLog = jest.fn()
    const errorLog = jest.fn()
    const mockAdd = jest.fn()
    const MockQueue = jest.fn(() => ({ add: mockAdd }))

    let mod: {
        enqueueBatchJob: (id: string) => Promise<unknown>
        getBatchQueue: () => unknown
    }
    jest.isolateModules(() => {
        jest.doMock('@lucky/shared/services', () => ({
            redisClient: { getClient: () => redis },
        }))
        jest.doMock('@lucky/shared/utils', () => ({ warnLog, errorLog }))
        jest.doMock('bullmq', () => ({ Queue: MockQueue }))
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('./batchQueue')
    })
    return { mod: mod!, warnLog, errorLog, MockQueue, mockAdd }
}

describe('batchQueue', () => {
    describe('when redis is unavailable', () => {
        it('enqueueBatchJob returns null and warns', async () => {
            const { mod, warnLog } = makeModule(null)
            const result = await mod.enqueueBatchJob('job-1')
            expect(result).toBeNull()
            expect(warnLog).toHaveBeenCalled()
        })

        it('getBatchQueue returns null', () => {
            const { mod } = makeModule(null)
            expect(mod.getBatchQueue()).toBeNull()
        })
    })

    describe('when redis is available', () => {
        it('getBatchQueue initializes and returns queue', () => {
            const { mod, MockQueue } = makeModule({})
            const q = mod.getBatchQueue()
            expect(q).toBeTruthy()
            expect(MockQueue).toHaveBeenCalledWith('batch-jobs', {
                connection: {},
            })
        })

        it('getBatchQueue returns same instance on repeated calls', () => {
            const { mod, MockQueue } = makeModule({})
            mod.getBatchQueue()
            mod.getBatchQueue()
            expect(MockQueue).toHaveBeenCalledTimes(1)
        })

        it('enqueueBatchJob calls add with correct args and returns job', async () => {
            const fakeJob = { id: 'job-1' }
            const { mod, mockAdd } = makeModule({})
            mockAdd.mockResolvedValue(fakeJob)
            const result = await mod.enqueueBatchJob('job-1')
            expect(result).toBe(fakeJob)
            expect(mockAdd).toHaveBeenCalledWith(
                'job-1',
                { jobId: 'job-1' },
                { jobId: 'job-1', removeOnComplete: true, removeOnFail: true },
            )
        })

        it('enqueueBatchJob returns null and logs error when add throws', async () => {
            const { mod, mockAdd, errorLog } = makeModule({})
            mockAdd.mockRejectedValue(new Error('redis error'))
            const result = await mod.enqueueBatchJob('job-1')
            expect(result).toBeNull()
            expect(errorLog).toHaveBeenCalled()
        })
    })

    describe('when Queue constructor throws', () => {
        it('getBatchQueue returns null and logs error', () => {
            const errorLog = jest.fn()
            const ThrowingQueue = jest.fn(() => {
                throw new Error('connection refused')
            })
            let mod: { getBatchQueue: () => unknown }
            jest.isolateModules(() => {
                jest.doMock('@lucky/shared/services', () => ({
                    redisClient: { getClient: () => ({}) },
                }))
                jest.doMock('@lucky/shared/utils', () => ({
                    warnLog: jest.fn(),
                    errorLog,
                }))
                jest.doMock('bullmq', () => ({ Queue: ThrowingQueue }))
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                mod = require('./batchQueue')
            })
            expect(mod!.getBatchQueue()).toBeNull()
            expect(errorLog).toHaveBeenCalled()
        })
    })
})
