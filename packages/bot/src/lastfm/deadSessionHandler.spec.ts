import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const getByDiscordIdMock = jest.fn<(discordId: string) => Promise<unknown>>()
const unlinkMock = jest.fn<(discordId: string) => Promise<boolean>>()
const infoLogMock = jest.fn<(payload: unknown) => void>()
const warnLogMock = jest.fn<(payload: unknown) => void>()

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (discordId: string) => getByDiscordIdMock(discordId),
        unlink: (discordId: string) => unlinkMock(discordId),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (payload: unknown) => infoLogMock(payload),
    warnLog: (payload: unknown) => warnLogMock(payload),
}))

import {
    handleDeadLastFmSession,
    resetDeadSessionGuards,
} from './deadSessionHandler'

const makeClient = (sendImpl?: () => Promise<unknown>) => {
    const sendMock = jest.fn(sendImpl ?? (() => Promise.resolve()))
    const fetchMock = jest.fn(() => Promise.resolve({ send: sendMock }))
    return {
        client: { users: { fetch: fetchMock } } as never,
        sendMock,
        fetchMock,
    }
}

describe('handleDeadLastFmSession', () => {
    beforeEach(() => {
        getByDiscordIdMock.mockReset()
        unlinkMock.mockReset()
        infoLogMock.mockReset()
        warnLogMock.mockReset()
        resetDeadSessionGuards()
    })

    it('does nothing without a discordId', async () => {
        await handleDeadLastFmSession(undefined, null, 'test')
        expect(getByDiscordIdMock).not.toHaveBeenCalled()
    })

    it('unlinks, logs, and DMs once when the dead key is a DB row', async () => {
        getByDiscordIdMock.mockResolvedValue({ discordId: 'user-1' })
        const { client, sendMock } = makeClient()

        await handleDeadLastFmSession('user-1', client, 'scrobble')
        await handleDeadLastFmSession('user-1', client, 'updateNowPlaying')

        expect(unlinkMock).toHaveBeenCalledTimes(2)
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Removed invalid Last.fm session',
                data: expect.objectContaining({ discordId: 'user-1' }),
            }),
        )
        expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('warns once and never unlinks or DMs when the dead key is the env fallback', async () => {
        getByDiscordIdMock.mockResolvedValue(null)
        const { client, sendMock, fetchMock } = makeClient()

        await handleDeadLastFmSession('user-1', client, 'scrobble')
        await handleDeadLastFmSession('user-2', client, 'scrobble')

        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('LASTFM_SESSION_KEY'),
            }),
        )
        expect(unlinkMock).not.toHaveBeenCalled()
        expect(fetchMock).not.toHaveBeenCalled()
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('swallows DM failures after a successful unlink', async () => {
        getByDiscordIdMock.mockResolvedValue({ discordId: 'user-1' })
        const { client } = makeClient(() =>
            Promise.reject(new Error('Cannot send messages to this user')),
        )

        await expect(
            handleDeadLastFmSession('user-1', client, 'scrobble'),
        ).resolves.toBeUndefined()
        expect(unlinkMock).toHaveBeenCalledWith('user-1')
    })

    it('handles a null client without throwing', async () => {
        getByDiscordIdMock.mockResolvedValue({ discordId: 'user-1' })

        await expect(
            handleDeadLastFmSession('user-1', null, 'scrobble'),
        ).resolves.toBeUndefined()
        expect(unlinkMock).toHaveBeenCalledWith('user-1')
    })
})
