import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('../monitoring/sentry', () => ({
    addBreadcrumb: jest.fn(),
    captureMessage: jest.fn(),
}))

import { TopggStatsScheduler } from './topggStatsScheduler'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { addBreadcrumb, captureMessage } from '../monitoring/sentry'

function makeClient(guildCount: number) {
    return {
        guilds: {
            cache: {
                size: guildCount,
            },
        },
    }
}

beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.TOPGG_TOKEN
})

describe('TopggStatsScheduler', () => {
    test('should skip entirely when TOPGG_TOKEN is unset', async () => {
        const mockFetch = jest.fn()
        const scheduler = new TopggStatsScheduler({ fetch: mockFetch })
        const client = makeClient(5) as any

        scheduler.start(client)

        expect(infoLog).toHaveBeenCalledWith({
            message: expect.stringContaining('TOPGG_TOKEN not set'),
        })
        expect(mockFetch).not.toHaveBeenCalled()
    })

    test('should POST server count on ready and every interval when TOPGG_TOKEN is set', async () => {
        process.env.TOPGG_TOKEN = 'test-token-123'
        const mockFetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
        })
        const scheduler = new TopggStatsScheduler({
            tickIntervalMs: 100,
            fetch: mockFetch,
        })
        const client = makeClient(42) as any

        scheduler.start(client)

        // Wait for onStart's immediate tick to complete
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(mockFetch).toHaveBeenCalledWith(
            'https://top.gg/api/bots/962198089161134131/stats',
            {
                method: 'POST',
                headers: {
                    'Authorization': 'test-token-123',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ server_count: 42 }),
            },
        )
        expect(infoLog).toHaveBeenCalledWith({
            message: 'Top.gg stats posted successfully',
            data: { serverCount: 42 },
        })

        scheduler.stop()
    })

    test('should log warning and capture Sentry message on failed POST', async () => {
        process.env.TOPGG_TOKEN = 'test-token-123'
        const mockFetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: jest.fn().mockResolvedValue('error details'),
        })
        const scheduler = new TopggStatsScheduler({
            tickIntervalMs: 100,
            fetch: mockFetch,
        })
        const client = makeClient(10) as any

        scheduler.start(client)

        // Wait for onStart's immediate tick to complete
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Top.gg stats POST failed'),
                data: expect.objectContaining({
                    status: 500,
                    serverCount: 10,
                }),
            }),
        )
        expect(captureMessage).toHaveBeenCalledWith(
            expect.stringContaining('Top.gg stats POST failed'),
            'warning',
            expect.objectContaining({
                category: 'topgg.stats',
                serverCount: 10,
            }),
        )

        scheduler.stop()
    })

    test('should log warning on fetch error', async () => {
        process.env.TOPGG_TOKEN = 'test-token-123'
        const testError = new Error('Network error')
        const mockFetch = jest.fn().mockRejectedValue(testError)
        const scheduler = new TopggStatsScheduler({
            tickIntervalMs: 100,
            fetch: mockFetch,
        })
        const client = makeClient(7) as any

        scheduler.start(client)

        // Wait for onStart's immediate tick to complete
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Top.gg stats POST request failed'),
                data: expect.objectContaining({
                    serverCount: 7,
                }),
            }),
        )
        expect(captureMessage).toHaveBeenCalledWith(
            expect.stringContaining('Top.gg stats POST request failed'),
            'warning',
            expect.objectContaining({
                category: 'topgg.stats',
            }),
        )

        scheduler.stop()
    })

    test('should use global fetch when no fetch override provided', async () => {
        process.env.TOPGG_TOKEN = 'test-token-123'
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
        })
        const scheduler = new TopggStatsScheduler()
        const client = makeClient(3) as any

        scheduler.start(client)

        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('top.gg/api/bots'),
            expect.objectContaining({
                method: 'POST',
            }),
        )

        scheduler.stop()
    })
})
