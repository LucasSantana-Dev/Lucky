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

function makeChannel(deleteImpl?: any) {
    return {
        isDMBased: () => false,
        delete: deleteImpl ?? jest.fn().mockResolvedValue(undefined),
    }
}

function makeClient(channel: unknown) {
    return { channels: { fetch: jest.fn().mockResolvedValue(channel) } }
}

/** Run one sweep deterministically. */
async function sweep(client: unknown) {
    const scheduler = new SupportSessionScheduler()
    ;(scheduler as unknown as { client: unknown }).client = client
    await (scheduler as unknown as { execute: () => Promise<void> }).execute()
    return scheduler
}

describe('SupportSessionScheduler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        supportSessionServiceMock.getExpired.mockResolvedValue([])
        supportSessionServiceMock.close.mockResolvedValue(undefined)
    })

    it('deletes the channel and closes the session for each expired ticket', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue([
            { id: 's1', channelId: 'c1' },
        ])
        const del = jest.fn().mockResolvedValue(undefined)
        await sweep(makeClient(makeChannel(del)))

        expect(del).toHaveBeenCalledWith('Support ticket expired')
        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
    })

    it('still closes the session when the channel is already gone', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue([
            { id: 's1', channelId: 'c1' },
        ])
        await sweep(makeClient(null)) // fetch resolves null

        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
    })

    it('treats a 10003 (unknown channel) delete error as already-gone and closes', async () => {
        supportSessionServiceMock.getExpired.mockResolvedValue([
            { id: 's1', channelId: 'c1' },
        ])
        const del = jest.fn().mockRejectedValue({ code: 10003 })
        await sweep(makeClient(makeChannel(del)))

        expect(supportSessionServiceMock.close).toHaveBeenCalledWith('s1')
    })

    it('does nothing when there are no expired tickets', async () => {
        const fetch = jest.fn()
        await sweep({ channels: { fetch } })

        expect(fetch).not.toHaveBeenCalled()
        expect(supportSessionServiceMock.close).not.toHaveBeenCalled()
    })
})
