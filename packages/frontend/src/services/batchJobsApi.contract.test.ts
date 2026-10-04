import { describe, test, expect, vi } from 'vitest'
import { batchJobsSchemas } from '../../../backend/src/schemas/batchJobs'
import { createBatchJobsApi } from './batchJobsApi'

const guildId = '123456789012345678'

describe('batch jobs frontend/backend contract', () => {
    test('the list call sends filters as params the backend list query schema accepts', () => {
        const apiClient = { get: vi.fn() }
        createBatchJobsApi(apiClient as never).list(guildId, {
            status: 'in_progress',
            limit: 25,
            offset: 50,
        })

        const [path, config] = apiClient.get.mock.calls[0]
        expect(path).toBe(`/guilds/${guildId}/batch-jobs`)
        expect(config.params).toEqual({
            status: 'in_progress',
            limit: 25,
            offset: 50,
        })
        expect(
            batchJobsSchemas.listQuery.safeParse(config.params).success,
        ).toBe(true)
    })

    test('the list call without filters sends undefined params, which the schema accepts as an empty query', () => {
        const apiClient = { get: vi.fn() }
        createBatchJobsApi(apiClient as never).list(guildId)

        expect(apiClient.get.mock.calls[0][1]).toEqual({ params: undefined })
        expect(batchJobsSchemas.listQuery.safeParse({}).success).toBe(true)
    })

    test('a list status outside the backend enum is rejected for the status field', () => {
        const result = batchJobsSchemas.listQuery.safeParse({
            status: 'running',
        })

        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues).toHaveLength(1)
        expect(result.error.issues[0]).toMatchObject({
            code: 'invalid_value',
            path: ['status'],
        })
    })
})
