import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const getByDiscordIdMock = jest.fn<(discordId: string) => Promise<unknown>>()
const unlinkMock =
    jest.fn<(discordId: string, sessionKey: string) => Promise<string>>()
const infoLogMock = jest.fn<(payload: unknown) => void>()
const warnLogMock = jest.fn<(payload: unknown) => void>()

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (discordId: string) => getByDiscordIdMock(discordId),
        unlinkIfKeyMatches: (discordId: string, sessionKey: string) =>
            unlinkMock(discordId, sessionKey),
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

const OPTS = { envFallbackUsed: false, via: 'test' }
const ENV_OPTS = { envFallbackUsed: true, via: 'test' }

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
        unlinkMock.mockReset().mockResolvedValue('removed')
        infoLogMock.mockReset()
        warnLogMock.mockReset()
        resetDeadSessionGuards()
    })

    it('does nothing without a discordId when env fallback was not used', async () => {
        await handleDeadLastFmSession(undefined, 'key-1', null, OPTS)
        expect(getByDiscordIdMock).not.toHaveBeenCalled()
        expect(warnLogMock).not.toHaveBeenCalled()
    })

    it('warns about the env key when a requester-less env-fallback call fails', async () => {
        await handleDeadLastFmSession(undefined, 'key-1', null, ENV_OPTS)
        await handleDeadLastFmSession(undefined, 'key-1', null, ENV_OPTS)
        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('LASTFM_SESSION_KEY'),
            }),
        )
    })

    it('unlinks, logs, and DMs once when the dead key matches the DB row', async () => {
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-1',
        })
        // Model the production contract: the racing second delete is stale
        unlinkMock.mockResolvedValueOnce('removed').mockResolvedValue('stale')
        const { client, sendMock } = makeClient()

        await handleDeadLastFmSession('user-1', 'key-1', client, OPTS)
        await handleDeadLastFmSession('user-1', 'key-1', client, OPTS)

        expect(unlinkMock).toHaveBeenCalledTimes(2)
        expect(infoLogMock).toHaveBeenCalledTimes(1)
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Removed invalid Last.fm session',
                data: expect.objectContaining({ discordId: 'user-1' }),
            }),
        )
        expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('notifies again when a relinked session (new key) also expires', async () => {
        const { client, sendMock } = makeClient()
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-1',
        })
        await handleDeadLastFmSession('user-1', 'key-1', client, OPTS)

        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-2',
        })
        await handleDeadLastFmSession('user-1', 'key-2', client, OPTS)

        expect(sendMock).toHaveBeenCalledTimes(2)
    })

    it('never unlinks when the row key differs from the failed key (stale error 9 after relink)', async () => {
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-new',
        })
        const { client, sendMock } = makeClient()

        await handleDeadLastFmSession('user-1', 'key-old', client, OPTS)

        expect(unlinkMock).not.toHaveBeenCalled()
        expect(sendMock).not.toHaveBeenCalled()
        expect(infoLogMock).not.toHaveBeenCalled()
    })

    it('warns once and never unlinks or DMs when the dead key is the env fallback', async () => {
        getByDiscordIdMock.mockResolvedValue(null)
        const { client, sendMock, fetchMock } = makeClient()

        await handleDeadLastFmSession('user-1', 'key-1', client, ENV_OPTS)
        await handleDeadLastFmSession('user-2', 'key-1', client, ENV_OPTS)

        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(unlinkMock).not.toHaveBeenCalled()
        expect(fetchMock).not.toHaveBeenCalled()
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('does not warn env-key on the non-fallback path when the row is already gone', async () => {
        getByDiscordIdMock.mockResolvedValue(null)

        await handleDeadLastFmSession('user-1', 'key-1', null, OPTS)

        expect(warnLogMock).not.toHaveBeenCalled()
        expect(unlinkMock).not.toHaveBeenCalled()
    })

    it('treats a lookup failure as inconclusive — no env warning, no unlink', async () => {
        getByDiscordIdMock.mockRejectedValue(new Error('db down'))

        await handleDeadLastFmSession('user-1', 'key-1', null, ENV_OPTS)

        expect(warnLogMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('lookup failed'),
            }),
        )
        expect(unlinkMock).not.toHaveBeenCalled()
    })

    it('stays silent and does not DM when the delete comes back stale (racing cleanup)', async () => {
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-1',
        })
        unlinkMock.mockResolvedValue('stale')
        const { client, sendMock } = makeClient()

        await handleDeadLastFmSession('user-1', 'key-1', client, OPTS)

        expect(infoLogMock).not.toHaveBeenCalled()
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('stays silent and does not DM when the delete errors (service logs it)', async () => {
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-1',
        })
        unlinkMock.mockResolvedValue('error')
        const { client, sendMock } = makeClient()

        await handleDeadLastFmSession('user-1', 'key-1', client, OPTS)

        expect(infoLogMock).not.toHaveBeenCalled()
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('swallows DM failures after a successful unlink', async () => {
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-1',
        })
        const { client } = makeClient(() =>
            Promise.reject(new Error('Cannot send messages to this user')),
        )

        await expect(
            handleDeadLastFmSession('user-1', 'key-1', client, OPTS),
        ).resolves.toBeUndefined()
        expect(unlinkMock).toHaveBeenCalledWith('user-1', 'key-1')
    })

    it('handles a null client without throwing', async () => {
        getByDiscordIdMock.mockResolvedValue({
            discordId: 'user-1',
            sessionKey: 'key-1',
        })
        await expect(
            handleDeadLastFmSession('user-1', 'key-1', null, OPTS),
        ).resolves.toBeUndefined()
        expect(unlinkMock).toHaveBeenCalledWith('user-1', 'key-1')
    })
})
