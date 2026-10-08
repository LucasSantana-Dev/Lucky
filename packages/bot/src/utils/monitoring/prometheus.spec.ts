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

import {
    registry,
    renderMetrics,
    commandsTotal,
    commandDurationSeconds,
    commandEventsDroppedTotal,
} from './prometheus'

describe('prometheus registry', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        countMock.mockReset()
        getStoredClientMock.mockReset()
    })

    it('exposes lucky_bot_guilds_total with active and left labels on scrape', async () => {
        countMock.mockImplementation(async (args) => {
            const arg = args as { where?: { leftAt?: null } }
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
        expect(text).toMatch(/service="lucky-bot"/)
    })

    it('counts only guilds the bot actually joined', async () => {
        countMock.mockResolvedValue(0)

        await renderMetrics()

        expect(countMock).toHaveBeenCalledTimes(2)
        for (const [args] of countMock.mock.calls) {
            expect(args).toMatchObject({
                where: { joinedAt: { not: null } },
            })
        }
    })

    it('logs but does not throw when Prisma fails', async () => {
        countMock.mockRejectedValue(new Error('db down'))
        const text = await renderMetrics()
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

    it('command metrics use bounded labels and no guild/user labels (#2391)', async () => {
        countMock.mockResolvedValue(0)
        commandsTotal.inc({ command: 'play', kind: 'slash', outcome: 'ok' })
        commandDurationSeconds.observe({ command: 'play' }, 0.2)
        commandEventsDroppedTotal.inc({ reason: 'overflow' })

        const text = await renderMetrics()

        const line = (name: string) =>
            text.split('\n').find((l) => l.startsWith(name)) ?? ''
        expect(line('lucky_bot_commands_total{')).toMatch(/command="play"/)
        expect(line('lucky_bot_commands_total{')).toMatch(/kind="slash"/)
        expect(line('lucky_bot_commands_total{')).toMatch(/outcome="ok"/)
        expect(line('lucky_bot_command_duration_seconds_bucket{')).toMatch(
            /command="play"/,
        )
        expect(line('lucky_bot_command_events_dropped_total{')).toMatch(
            /reason="overflow"/,
        )
        expect(text).not.toMatch(/lucky_bot_command\w*\{[^}]*(guild|user)/)
    })

    it('reports lucky_bot_gateway_connected=0 when no client is stored yet', async () => {
        countMock.mockResolvedValue(0)
        getStoredClientMock.mockReturnValue(null)

        const text = await renderMetrics()

        expect(text).toMatch(/lucky_bot_gateway_connected(\{[^}]*\})?\s+0/)
    })

    it('exports every recap fallback reason at 0 before any fallback', async () => {
        countMock.mockResolvedValue(0)

        const text = await renderMetrics()

        for (const reason of [
            'disabled',
            'no_attach_permission',
            'timeout',
            'http_error',
            'bad_response',
            'network',
        ]) {
            expect(text).toMatch(
                new RegExp(
                    `lucky_bot_render_fallback_total\\{[^}]*reason="${reason}"[^}]*\\}\\s+0`,
                ),
            )
        }
    })
})
