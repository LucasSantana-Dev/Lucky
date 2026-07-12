import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const supportSessionServiceMock = {
    getExpired: jest.fn() as jest.MockedFunction<any>,
    close: jest.fn() as jest.MockedFunction<any>,
}

jest.mock('@lucky/shared/services', () => ({
    supportSessionService: supportSessionServiceMock,
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

import { SupportSessionScheduler } from './supportSessionScheduler'

function makeClient(opts: { fetch?: any; channel?: unknown }) {
    const fetch =
        opts.fetch ?? jest.fn().mockResolvedValue(opts.channel ?? null)
    return { channels: { fetch } }
}

function makeChannel(deleteImpl?: any) {
    return {
        isDMBased: () => false,
        delete: deleteImpl ?? jest.fn().mockResolvedValue(undefined),
    }
}

/** Run one sweep deterministically. */
async function sweep(client: unknown) {
    const scheduler = new SupportSessionScheduler()
    ;(scheduler as unknown as { client: unknown }).client = client
    await (scheduler as unknown as { execute: () => Promise<void> }).execute()
}

const ONE = [{ id: 's1', channelId: 'c1' }]

describe('SupportSessionScheduler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        supportSessionServiceMock.getExpired.mockResolvedValue([])
        supportSessionServiceMock.close.mockResolvedValue(undefined)
    })

    it('deletes the channel and closes the session on success', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue(ONE)
        const del = jest.fn().mockResolvedValue(undefined)
        await sweep(makeClient({ channel: makeChannel(del) }))

        expect(del).toHaveBeenCalledWith('Support ticket expired')
        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
    })

    it('closes the session when the channel is already gone (10003 on fetch)', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue(ONE)
        await sweep(
            makeClient({ fetch: jest.fn().mockRejectedValue({ code: 10003 }) }),
        )

        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
    })

    it('LEAVES the session open when delete fails with 50013 (missing perms)', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue(ONE)
        const del = jest.fn().mockRejectedValue({ code: 50013 })
        await sweep(makeClient({ channel: makeChannel(del) }))

        // Channel still exists — must NOT close, so a later sweep retries.
        expect(supportSessionServiceMock.close).not.toHaveBeenCalled()
    })

    it('LEAVES the session open on a transient fetch error', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue(ONE)
        await sweep(
            makeClient({
                fetch: jest.fn().mockRejectedValue(new Error('gateway 503')),
            }),
        )

        expect(supportSessionServiceMock.close).not.toHaveBeenCalled()
    })

    it('closes the session when the channel is deleted mid-sweep (10003 on delete)', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue(ONE)
        const del = jest.fn().mockRejectedValue({ code: 10003 })
        await sweep(makeClient({ channel: makeChannel(del) }))

        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
    })

    it('does nothing when there are no expired tickets', async () => {
        const fetch = jest.fn()
        await sweep(makeClient({ fetch }))

        expect(fetch).not.toHaveBeenCalled()
        expect(supportSessionServiceMock.close).not.toHaveBeenCalled()
    })
})
