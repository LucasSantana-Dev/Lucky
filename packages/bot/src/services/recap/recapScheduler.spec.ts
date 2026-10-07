import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    ChannelType,
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js'

type AnyFn = (...args: any[]) => any
const listDueRecapsMock = jest.fn<AnyFn>()
const claimRecapWeekMock = jest.fn<AnyFn>()
const disableRecapMock = jest.fn<AnyFn>()
const getWeeklyRecapMock = jest.fn<AnyFn>()

jest.mock('./recapStore', () => ({
    listDueRecaps: (...a: unknown[]) => listDueRecapsMock(...a),
    claimRecapWeek: (...a: unknown[]) => claimRecapWeekMock(...a),
    disableRecap: (...a: unknown[]) => disableRecapMock(...a),
}))

jest.mock('@lucky/shared/services', () => ({
    getWeeklyRecap: (...a: unknown[]) => getWeeklyRecapMock(...a),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))

import { RecapScheduler } from './recapScheduler'

const NOW = new Date('2026-10-11T18:20:00.000Z')
const BOUNDARY = new Date('2026-10-11T18:00:00.000Z')

function recap(plays: number) {
    return {
        schemaVersion: 1,
        guildId: 'g-1',
        from: '2026-10-04T18:00:00.000Z',
        to: '2026-10-11T18:00:00.000Z',
        plays,
        skips: 0,
        autoplayPlays: 0,
        listenedSeconds: 0,
        topTracks: [],
        topArtists: [],
    }
}

const ALL_RECAP_PERMS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
]

function makeClient(
    channel: unknown,
    {
        perms = ALL_RECAP_PERMS,
        fetchError,
        me = {},
        fetchMe = jest.fn<AnyFn>().mockRejectedValue(new Error('gateway')),
    }: {
        perms?: bigint[]
        fetchError?: unknown
        me?: unknown
        fetchMe?: AnyFn
    } = {},
) {
    const send = jest.fn<AnyFn>().mockResolvedValue(undefined)
    const ch =
        channel === 'text'
            ? {
                  type: ChannelType.GuildText,
                  id: 'c-1',
                  send,
                  permissionsFor: () => new PermissionsBitField(perms),
              }
            : channel
    const fetch = fetchError
        ? jest.fn<AnyFn>().mockRejectedValue(fetchError)
        : jest.fn<AnyFn>().mockResolvedValue(ch)
    const guild = {
        id: 'g-1',
        members: { me, fetchMe },
        channels: { fetch },
    }
    const client = {
        guilds: {
            cache: { get: (id: string) => (id === 'g-1' ? guild : undefined) },
        },
    }
    return { client, send }
}

async function runTick(client: unknown) {
    const scheduler = new RecapScheduler({ clock: () => NOW })
    ;(scheduler as unknown as { client: unknown }).client = client
    await scheduler.tick()
}

describe('RecapScheduler (#2678)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        listDueRecapsMock.mockResolvedValue([
            { guildId: 'g-1', channelId: 'c-1' },
        ])
        claimRecapWeekMock.mockResolvedValue(true)
    })

    it('asks for guilds due since the latest Sunday 18:00 UTC', async () => {
        listDueRecapsMock.mockResolvedValue([])
        await runTick(makeClient('text').client)

        expect(listDueRecapsMock).toHaveBeenCalledWith(BOUNDARY)
    })

    it('claims the week, then posts it without pinging anyone', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text')

        await runTick(client)

        expect(getWeeklyRecapMock).toHaveBeenCalledWith(
            'g-1',
            new Date('2026-10-04T18:00:00.000Z'),
            BOUNDARY,
        )
        expect(claimRecapWeekMock).toHaveBeenCalledWith(
            'g-1',
            'c-1',
            BOUNDARY,
            NOW,
        )
        expect(send).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0][0]).toEqual(
            expect.objectContaining({ allowedMentions: { parse: [] } }),
        )
    })

    it('claims a quiet week without posting, so it is not re-read hourly', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(4))
        const { client, send } = makeClient('text')

        await runTick(client)

        expect(claimRecapWeekMock).toHaveBeenCalledTimes(1)
        expect(send).not.toHaveBeenCalled()
    })

    it('does not post when the claim fails (/recap changed since listing)', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        claimRecapWeekMock.mockResolvedValue(false)
        const { client, send } = makeClient('text')

        await runTick(client)

        expect(send).not.toHaveBeenCalled()
    })

    it.each([
        ['a deleted channel', makeClient(null)],
        ['a non-text channel', makeClient({ type: ChannelType.GuildVoice })],
        [
            'Unknown Channel from Discord',
            makeClient('text', { fetchError: { code: 10003 } }),
        ],
        [
            'Missing Access from Discord',
            makeClient('text', { fetchError: { code: 50001 } }),
        ],
        [
            'a missing Embed Links permission',
            makeClient('text', {
                perms: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                ],
            }),
        ],
    ])('clears that channel on %s without posting', async (_, made) => {
        await runTick(made.client)

        expect(disableRecapMock).toHaveBeenCalledWith('g-1', 'c-1')
        expect(made.send).not.toHaveBeenCalled()
        expect(getWeeklyRecapMock).not.toHaveBeenCalled()
        expect(claimRecapWeekMock).not.toHaveBeenCalled()
    })

    it.each([
        [
            'a Discord 5xx on channel fetch',
            makeClient('text', { fetchError: { code: 0, status: 503 } }),
        ],
        [
            'a network error on channel fetch',
            makeClient('text', { fetchError: new Error('ECONNRESET') }),
        ],
        [
            'the bot member not cached and fetchMe failing',
            makeClient('text', { me: null }),
        ],
    ])('keeps the opt-in on %s, to retry next tick', async (_, made) => {
        await runTick(made.client)

        expect(disableRecapMock).not.toHaveBeenCalled()
        expect(claimRecapWeekMock).not.toHaveBeenCalled()
        expect(made.send).not.toHaveBeenCalled()
    })

    it('falls back to fetchMe when the bot member is not cached', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text', {
            me: null,
            fetchMe: jest.fn<AnyFn>().mockResolvedValue({}),
        })

        await runTick(client)

        expect(send).toHaveBeenCalledTimes(1)
    })

    it('a send failing after the claim is not retried (at most once)', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text')
        send.mockRejectedValue(new Error('discord down'))

        await runTick(client)
        listDueRecapsMock.mockResolvedValue([])
        await runTick(client)

        expect(send).toHaveBeenCalledTimes(1)
        expect(claimRecapWeekMock).toHaveBeenCalledTimes(1)
    })

    it('one failing guild does not stop the others', async () => {
        listDueRecapsMock.mockResolvedValue([
            { guildId: 'g-1', channelId: 'c-1' },
            { guildId: 'g-1', channelId: 'c-1' },
        ])
        getWeeklyRecapMock
            .mockRejectedValueOnce(new Error('db'))
            .mockResolvedValueOnce(recap(12))
        const { client, send } = makeClient('text')

        await runTick(client)

        expect(send).toHaveBeenCalledTimes(1)
    })

    it('skips a guild the bot is no longer in, keeping the opt-in', async () => {
        listDueRecapsMock.mockResolvedValue([
            { guildId: 'gone', channelId: 'c-1' },
        ])

        await runTick(makeClient('text').client)

        expect(disableRecapMock).not.toHaveBeenCalled()
        expect(claimRecapWeekMock).not.toHaveBeenCalled()
    })
})
