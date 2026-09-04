import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'

const warnLogMock = jest.fn()

jest.mock('../general/log', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

import { emitAlert } from './alertEmitter'

describe('emitAlert', () => {
    const originalWebhook = process.env.DISCORD_ALERT_WEBHOOK
    const originalFetch = global.fetch

    beforeEach(() => {
        process.env.DISCORD_ALERT_WEBHOOK = 'https://discord.example/webhook'
    })

    afterEach(() => {
        process.env.DISCORD_ALERT_WEBHOOK = originalWebhook
        global.fetch = originalFetch
    })

    it('is a no-op and does not warn when the webhook is unset', async () => {
        delete process.env.DISCORD_ALERT_WEBHOOK
        global.fetch = jest.fn() as unknown as typeof fetch

        await emitAlert({ title: 'Title', description: 'Desc' })

        expect(global.fetch).not.toHaveBeenCalled()
        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it('logs a warning and does not throw when the fetch itself fails', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('network down')
        }) as unknown as typeof fetch

        await expect(
            emitAlert({ title: 'Spam detected', description: 'Desc' }),
        ).resolves.toBeUndefined()

        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'alertEmitter: webhook delivery failed',
            data: {
                title: 'Spam detected',
                error: expect.stringContaining('network down'),
            },
        })
    })

    it('logs a warning and does not throw when the response is not ok', async () => {
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 429,
        })) as unknown as typeof fetch

        await expect(
            emitAlert({ title: 'Rate limited', description: 'Desc' }),
        ).resolves.toBeUndefined()

        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith({
            message: 'alertEmitter: webhook delivery failed',
            data: {
                title: 'Rate limited',
                error: expect.stringContaining('429'),
            },
        })
    })

    it('falls back to console.error and still does not throw when warnLog itself throws', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('network down')
        }) as unknown as typeof fetch
        const loggerError = new Error('warnLog transport failed')
        warnLogMock.mockImplementationOnce(() => {
            throw loggerError
        })
        const consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {})

        await expect(
            emitAlert({ title: 'Spam detected', description: 'Desc' }),
        ).resolves.toBeUndefined()

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'alertEmitter: webhook delivery failed',
            'Spam detected',
            expect.any(Error),
            loggerError,
        )

        consoleErrorSpy.mockRestore()
    })

    it('does not warn when the webhook POST succeeds', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 204,
        })) as unknown as typeof fetch

        await emitAlert({ title: 'OK', description: 'Desc' })

        expect(warnLogMock).not.toHaveBeenCalled()
    })
})
