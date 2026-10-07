import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ChannelType } from 'discord.js'

type AnyFn = (...args: any[]) => any
const listDueRecapsMock = jest.fn<AnyFn>()
const markRecapPostedMock = jest.fn<AnyFn>()
const disableRecapMock = jest.fn<AnyFn>()
const getWeeklyRecapMock = jest.fn<AnyFn>()

jest.mock('./recapStore', () => ({
    listDueRecaps: (...a: unknown[]) => listDueRecapsMock(...a),
    markRecapPosted: (...a: unknown[]) => markRecapPostedMock(...a),
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

function makeClient(channel: unknown, canPost = true) {
    const send = jest.fn<AnyFn>().mockResolvedValue(undefined)
    const ch =
        channel === 'text'
            ? {
                  type: ChannelType.GuildText,
                  id: 'c-1',
                  send,
                  permissionsFor: () => ({ has: () => canPost }),
              }
            : channel
    const guild = {
        id: 'g-1',
        members: { me: {} },
        channels: { fetch: jest.fn<AnyFn>().mockResolvedValue(ch) },
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
    })

    it('asks for guilds due since the latest Sunday 18:00 UTC', async () => {
        listDueRecapsMock.mockResolvedValue([])
        await runTick(makeClient('text').client)

        expect(listDueRecapsMock).toHaveBeenCalledWith(BOUNDARY)
    })

    it('posts the week ending at the boundary and marks it posted', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text')

        await runTick(client)

        expect(getWeeklyRecapMock).toHaveBeenCalledWith(
            'g-1',
            new Date('2026-10-04T18:00:00.000Z'),
            BOUNDARY,
        )
        expect(send).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0][0]).toEqual(
            expect.objectContaining({ allowedMentions: { parse: [] } }),
        )
        expect(markRecapPostedMock).toHaveBeenCalledWith('g-1', NOW)
    })

    it('skips a quiet week but still marks it, so it is not re-read hourly', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(4))
        const { client, send } = makeClient('text')

        await runTick(client)

        expect(send).not.toHaveBeenCalled()
        expect(markRecapPostedMock).toHaveBeenCalledWith('g-1', NOW)
    })

    it.each([
        ['a deleted channel', null, true],
        ['a non-text channel', { type: ChannelType.GuildVoice }, true],
        ['missing permissions', 'text', false],
    ])(
        'clears the opt-in on %s without posting',
        async (_, channel, canPost) => {
            const { client, send } = makeClient(channel, canPost)

            await runTick(client)

            expect(disableRecapMock).toHaveBeenCalledWith('g-1')
            expect(send).not.toHaveBeenCalled()
            expect(getWeeklyRecapMock).not.toHaveBeenCalled()
            expect(markRecapPostedMock).not.toHaveBeenCalled()
        },
    )

    it('does not mark the week when the send fails, so the next tick retries', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text')
        send.mockRejectedValue(new Error('discord down'))

        await runTick(client)

        expect(markRecapPostedMock).not.toHaveBeenCalled()
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
        expect(markRecapPostedMock).not.toHaveBeenCalled()
    })
})
