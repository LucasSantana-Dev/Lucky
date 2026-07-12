import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const countMock = jest.fn<(args?: unknown) => Promise<number>>()
const errorLogMock = jest.fn()
const getStoredClientMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => ({
        guild: { count: (args?: unknown) => countMock(args) },
    }),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: jest.fn(),
}))

jest.mock('../../bot/clientStore', () => ({
    getStoredClient: () => getStoredClientMock(),
}))

import { registry, renderMetrics } from './prometheus'

describe('prometheus registry', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        countMock.mockReset()
        getStoredClientMock.mockReset()
    })

    it('exposes lucky_bot_guilds_total with active and left labels on scrape', async () => {
        countMock.mockImplementation(async (args) => {
            const arg = args as { where?: { leftAt?: null | { not: null } } }
            if (arg?.where?.leftAt === null) return 42
            return 3
        })

        const text = await renderMetrics()

        expect(text).toContain('# HELP lucky_bot_guilds_total')
        expect(text).toMatch(
            /lucky_bot_guilds_total\{[^}]*state="active"[^}]*\}\s+42/,
        )
        expect(text).toMatch(
            /lucky_bot_guilds_total\{[^}]*state="left"[^}]*\}\s+3/,
        )
        // service default label is applied to all series
        expect(text).toMatch(/service="lucky-bot"/)
    })

    it('logs but does not throw when Prisma fails', async () => {
        countMock.mockRejectedValue(new Error('db down'))
        const text = await renderMetrics()
        // Should still render (just without fresh values for the failing gauge).
        expect(text).toContain('lucky_bot_guilds_total')
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('registers default Node process metrics', async () => {
        countMock.mockResolvedValue(0)
        const text = await renderMetrics()
        expect(text).toContain('process_cpu_user_seconds_total')
        expect(text).toContain('nodejs_eventloop_lag_seconds')
    })

    it('registry contentType is the Prometheus text exposition format', () => {
        expect(registry.contentType).toMatch(/^text\/plain.*version=0\.0\.4/i)
    })

    it('reports lucky_bot_gateway_connected=1 when the client is ready', async () => {
        countMock.mockResolvedValue(0)
        getStoredClientMock.mockReturnValue({ isReady: () => true })

        const text = await renderMetrics()

        expect(text).toMatch(/lucky_bot_gateway_connected(\{[^}]*\})?\s+1/)
    })

    it('reports lucky_bot_gateway_connected=0 when the client is not ready', async () => {
        countMock.mockResolvedValue(0)
        getStoredClientMock.mockReturnValue({ isReady: () => false })

        const text = await renderMetrics()

        expect(text).toMatch(/lucky_bot_gateway_connected(\{[^}]*\})?\s+0/)
    })

    it('reports lucky_bot_gateway_connected=0 when no client is stored yet', async () => {
        countMock.mockResolvedValue(0)
        getStoredClientMock.mockReturnValue(null)

        const text = await renderMetrics()

        expect(text).toMatch(/lucky_bot_gateway_connected(\{[^}]*\})?\s+0/)
    })
})
