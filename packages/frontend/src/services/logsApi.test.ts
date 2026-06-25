import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createLogsApi } from './logsApi'

describe('createLogsApi', () => {
    let mockClient: AxiosInstance
    let api: ReturnType<typeof createLogsApi>

    const SERVER_LOG = {
        id: 'log-1',
        guildId: 'g1',
        type: 'message',
        userId: 'user-1',
        action: 'MESSAGE_CREATED',
        details: 'User sent a message',
        createdAt: '2026-01-01T00:00:00Z',
    }

    beforeEach(() => {
        mockClient = {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        } as unknown as AxiosInstance
        api = createLogsApi(mockClient)
    })

    describe('getRecent', () => {
        test('returns logs on success', async () => {
            const response = {
                data: { logs: [SERVER_LOG], total: 1 },
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce(response)

            const result = await api.getRecent('g1')

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs', {
                params: {},
            })
            expect(result.data.logs).toEqual([SERVER_LOG])
        })

        test('passes limit parameter correctly', async () => {
            const response = {
                data: { logs: [], total: 0 },
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce(response)

            await api.getRecent('g1', 50)

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs', {
                params: { limit: 50 },
            })
        })

        test('returns empty array when no logs', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            const result = await api.getRecent('g1')

            expect(result.data.logs).toEqual([])
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            await api.getRecent('guild-123')

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-123/logs',
                expect.anything(),
            )
        })

        test('omits limit param when undefined', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            await api.getRecent('g1', undefined)

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs', {
                params: {},
            })
        })
    })

    describe('getByType', () => {
        test('returns logs filtered by type', async () => {
            const response = {
                data: { logs: [SERVER_LOG], total: 1 },
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce(response)

            const result = await api.getByType('g1', 'message')

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs', {
                params: { type: 'message' },
            })
            expect(result.data.logs).toEqual([SERVER_LOG])
        })

        test('passes type and limit parameters', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            await api.getByType('g1', 'moderation', 100)

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs', {
                params: { type: 'moderation', limit: 100 },
            })
        })

        test('passes type without limit', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            await api.getByType('g1', 'warn')

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs', {
                params: { type: 'warn' },
            })
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            await api.getByType('guild-abc', 'kick', 50)

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-abc/logs',
                expect.anything(),
            )
        })

        test('returns empty array when no matching logs', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [], total: 0 },
            })

            const result = await api.getByType('g1', 'nonexistent')

            expect(result.data.logs).toEqual([])
        })
    })

    describe('search', () => {
        test('returns logs matching search filters', async () => {
            const response = {
                data: { logs: [SERVER_LOG] },
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce(response)

            const result = await api.search('g1', { type: 'message' })

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/g1/logs/search',
                { params: { type: 'message' } },
            )
            expect(result.data.logs).toEqual([SERVER_LOG])
        })

        test('passes userId filter', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            await api.search('g1', { userId: 'user-999' })

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/g1/logs/search',
                { params: { userId: 'user-999' } },
            )
        })

        test('passes type and userId filters together', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            await api.search('g1', { type: 'kick', userId: 'user-1' })

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/g1/logs/search',
                { params: { type: 'kick', userId: 'user-1' } },
            )
        })

        test('passes empty filters', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            await api.search('g1', {})

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/g1/logs/search',
                { params: {} },
            )
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            await api.search('guild-search', { type: 'ban' })

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-search/logs/search',
                expect.anything(),
            )
        })

        test('returns empty array when no matching results', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            const result = await api.search('g1', { type: 'nonexistent' })

            expect(result.data.logs).toEqual([])
        })
    })

    describe('getUserLogs', () => {
        test('returns user logs on success', async () => {
            const response = {
                data: { logs: [SERVER_LOG] },
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce(response)

            const result = await api.getUserLogs('g1', 'user-1')

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/g1/logs/users/user-1',
            )
            expect(result.data.logs).toEqual([SERVER_LOG])
        })

        test('passes userId in URL correctly', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            await api.getUserLogs('g1', 'user-999')

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/g1/logs/users/user-999',
            )
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            await api.getUserLogs('guild-user-logs', 'user-abc')

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-user-logs/logs/users/user-abc',
            )
        })

        test('returns empty array when no logs for user', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs: [] },
            })

            const result = await api.getUserLogs('g1', 'user-no-logs')

            expect(result.data.logs).toEqual([])
        })

        test('returns multiple logs for user', async () => {
            const logs = [SERVER_LOG, { ...SERVER_LOG, id: 'log-2' }]
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { logs },
            })

            const result = await api.getUserLogs('g1', 'user-1')

            expect(result.data.logs).toHaveLength(2)
        })
    })

    describe('getStats', () => {
        test('returns stats on success', async () => {
            const stats = { totalLogs: 1000, typeCounts: { message: 500 } }
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: stats,
            })

            const result = await api.getStats('g1')

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/logs/stats')
            expect(result.data).toEqual(stats)
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: {},
            })

            await api.getStats('guild-stats')

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-stats/logs/stats',
            )
        })

        test('returns stats object', async () => {
            const stats = {
                totalLogs: 5000,
                types: ['message', 'warn', 'kick'],
            }
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: stats,
            })

            const result = await api.getStats('g1')

            expect(result.data).toHaveProperty('totalLogs')
        })

        test('handles empty stats', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: {},
            })

            const result = await api.getStats('g1')

            expect(result.data).toBeDefined()
        })
    })
})
