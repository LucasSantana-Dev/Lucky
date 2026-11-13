import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../monitoring/sentry', () => ({
    captureMessage: jest.fn(),
}))

import { DirectoryStatsScheduler } from './directoryStatsScheduler'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { captureMessage } from '../monitoring/sentry'

const DBL_URL = 'https://discordbotlist.com/api/v1/bots/bot-1/stats'
const DBGG_URL = 'https://discord.bots.gg/api/v1/bots/bot-1/stats'

const client = { user: { id: 'bot-1' }, guilds: { cache: { size: 7 } } } as any

const ok = { ok: true, status: 200, statusText: 'OK' }

function make(fetchImpl: jest.Mock) {
    return new DirectoryStatsScheduler({ fetch: fetchImpl as any })
}

// start() fires an immediate tick; let it finish before driving more.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.DISCORDBOTLIST_TOKEN
    delete process.env.DISCORD_BOTS_GG_TOKEN
})

describe('DirectoryStatsScheduler', () => {
    test('no tokens: one info log, no request, no warning', async () => {
        const fetchMock = jest.fn()
        const scheduler = make(fetchMock)

        scheduler.start(client)
        await settle()
        scheduler.stop()
        scheduler.start(client)
        await settle()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(infoLog).toHaveBeenCalledTimes(1)
        expect(warnLog).not.toHaveBeenCalled()
        expect(captureMessage).not.toHaveBeenCalled()
        scheduler.stop()
    })

    test('only the configured directory is posted to', async () => {
        process.env.DISCORD_BOTS_GG_TOKEN = 'secret-b'
        const fetchMock = jest.fn().mockResolvedValue(ok as never)
        const scheduler = make(fetchMock)

        scheduler.start(client)
        await settle()

        const urls = fetchMock.mock.calls.map((c) => c[0])
        expect(urls).toEqual([DBGG_URL])
        scheduler.stop()
    })

    test('payload carries guild count, bot id in the URL, token in Authorization', async () => {
        process.env.DISCORDBOTLIST_TOKEN = 'secret-a'
        process.env.DISCORD_BOTS_GG_TOKEN = 'secret-b'
        const fetchMock = jest.fn().mockResolvedValue(ok as never)
        const scheduler = make(fetchMock)

        scheduler.start(client)
        await settle()

        const calls = new Map(
            fetchMock.mock.calls.map((c) => [c[0], c[1] as any]),
        )
        expect(JSON.parse(calls.get(DBL_URL).body)).toEqual({ guilds: 7 })
        expect(calls.get(DBL_URL).headers.Authorization).toBe('secret-a')
        expect(JSON.parse(calls.get(DBGG_URL).body)).toEqual({ guildCount: 7 })
        expect(calls.get(DBGG_URL).headers.Authorization).toBe('secret-b')
        expect(calls.get(DBGG_URL).method).toBe('POST')
        scheduler.stop()
    })

    test('rejected token disables that directory only, one warn, never logs the token', async () => {
        process.env.DISCORDBOTLIST_TOKEN = 'secret-a'
        process.env.DISCORD_BOTS_GG_TOKEN = 'secret-b'
        const fetchMock = jest.fn((url: string) =>
            Promise.resolve(
                url === DBL_URL
                    ? { ok: false, status: 401, statusText: 'Unauthorized' }
                    : ok,
            ),
        )
        const scheduler = make(fetchMock as any)

        scheduler.start(client)
        await settle()
        await scheduler.tick()

        const dblCalls = fetchMock.mock.calls.filter((c) => c[0] === DBL_URL)
        const dbggCalls = fetchMock.mock.calls.filter((c) => c[0] === DBGG_URL)
        expect(dblCalls).toHaveLength(1)
        expect(dbggCalls).toHaveLength(2)
        expect(warnLog).toHaveBeenCalledTimes(1)
        const logged = JSON.stringify((warnLog as jest.Mock).mock.calls)
        expect(logged).toContain('DISCORDBOTLIST_TOKEN')
        expect(logged).not.toContain('secret-a')
        scheduler.stop()
    })

    test('retryable failures warn each time but reach Sentry only on the 3rd in a row', async () => {
        process.env.DISCORD_BOTS_GG_TOKEN = 'secret-b'
        const fetchMock = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Server Error',
        } as never)
        const scheduler = make(fetchMock)

        scheduler.start(client)
        await settle()
        await scheduler.tick()
        expect(captureMessage).not.toHaveBeenCalled()
        await scheduler.tick()

        expect(warnLog).toHaveBeenCalledTimes(3)
        expect(captureMessage).toHaveBeenCalledTimes(1)
        await scheduler.tick()
        expect(captureMessage).toHaveBeenCalledTimes(1)
        scheduler.stop()
    })

    test('stop() clears the timer, so no post happens after it', async () => {
        jest.useFakeTimers()
        try {
            process.env.DISCORDBOTLIST_TOKEN = 'secret-a'
            const fetchMock = jest.fn().mockResolvedValue(ok as never)
            const scheduler = new DirectoryStatsScheduler({
                tickIntervalMs: 1000,
                fetch: fetchMock as any,
            })

            scheduler.start(client)
            await jest.advanceTimersByTimeAsync(1000)
            // One post on startup, one from the interval.
            expect(fetchMock).toHaveBeenCalledTimes(2)

            scheduler.stop()
            await jest.advanceTimersByTimeAsync(5000)
            expect(fetchMock).toHaveBeenCalledTimes(2)
            expect(jest.getTimerCount()).toBe(0)
        } finally {
            jest.useRealTimers()
        }
    })

    test('a success resets the failure streak; network errors count as failures', async () => {
        process.env.DISCORD_BOTS_GG_TOKEN = 'secret-b'
        const fetchMock = jest
            .fn()
            .mockRejectedValueOnce(new Error('boom') as never)
            .mockRejectedValueOnce(new Error('boom') as never)
            .mockResolvedValueOnce(ok as never)
            .mockRejectedValueOnce(new Error('boom') as never)
            .mockRejectedValueOnce(new Error('boom') as never)
            .mockRejectedValueOnce(new Error('boom') as never)
        const scheduler = make(fetchMock)

        scheduler.start(client)
        await settle()
        for (let i = 0; i < 4; i++) await scheduler.tick()

        expect(captureMessage).not.toHaveBeenCalled()
        await scheduler.tick()
        expect(captureMessage).toHaveBeenCalledTimes(1)
        scheduler.stop()
    })
})
