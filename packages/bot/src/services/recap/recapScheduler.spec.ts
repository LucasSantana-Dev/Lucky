import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    ChannelType,
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js'

type AnyFn = (...args: any[]) => any
const listDueRecapsMock = jest.fn<AnyFn>()
const claimRecapWeekMock = jest.fn<AnyFn>()
const releaseRecapWeekMock = jest.fn<AnyFn>()
const disableRecapMock = jest.fn<AnyFn>()
const getWeeklyRecapMock = jest.fn<AnyFn>()
const renderRecapCardMock = jest.fn<AnyFn>()
const fallbackIncMock = jest.fn<AnyFn>()
const fallbackLabelsMock = jest.fn<AnyFn>(() => ({ inc: fallbackIncMock }))
const cardPostedIncMock = jest.fn<AnyFn>()
const warnLogMock = jest.fn<AnyFn>()

jest.mock('./recapStore', () => ({
    listDueRecaps: (...a: unknown[]) => listDueRecapsMock(...a),
    claimRecapWeek: (...a: unknown[]) => claimRecapWeekMock(...a),
    releaseRecapWeek: (...a: unknown[]) => releaseRecapWeekMock(...a),
    disableRecap: (...a: unknown[]) => disableRecapMock(...a),
}))

jest.mock('@lucky/shared/services', () => ({
    getWeeklyRecap: (...a: unknown[]) => getWeeklyRecapMock(...a),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: (...a: unknown[]) => warnLogMock(...a),
}))

jest.mock('./recapCard', () => ({
    renderRecapCard: (...a: unknown[]) => renderRecapCardMock(...a),
}))

jest.mock('../../utils/monitoring/prometheus', () => ({
    recapCardPostedTotal: { inc: () => cardPostedIncMock() },
    renderFallbackTotal: {
        labels: (...a: unknown[]) => fallbackLabelsMock(...a),
    },
}))

jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))

import { RecapScheduler } from './recapScheduler'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 1])
const ATTACH_PERMS = ALL_RECAP_PERMS_FOR_CARD()

function ALL_RECAP_PERMS_FOR_CARD() {
    return [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
    ]
}

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
        delete process.env.RECAP_RENDER_ENABLED
        renderRecapCardMock.mockResolvedValue({ ok: true, jpeg: JPEG })
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

    it('a transient send failure hands the week back for the next tick', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text')
        send.mockRejectedValue(new Error('discord down'))

        await runTick(client)

        expect(releaseRecapWeekMock).toHaveBeenCalledWith('g-1', NOW)
        expect(disableRecapMock).not.toHaveBeenCalled()
    })

    it('a send refused for permissions clears that channel, keeping the claim', async () => {
        getWeeklyRecapMock.mockResolvedValue(recap(12))
        const { client, send } = makeClient('text')
        send.mockRejectedValue({ code: 50013 })

        await runTick(client)

        expect(disableRecapMock).toHaveBeenCalledWith('g-1', 'c-1')
        expect(releaseRecapWeekMock).not.toHaveBeenCalled()
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

    describe('image card (#2693)', () => {
        const textOnly = (call: any) => {
            expect(call.files).toBeUndefined()
            expect(call.embeds[0].toJSON().image).toBeUndefined()
            expect(call.allowedMentions).toEqual({ parse: [] })
        }

        it('sends the embed with the JPEG attached and its alt text', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })

            await runTick(client)

            expect(renderRecapCardMock).toHaveBeenCalledWith(recap(12))
            expect(send).toHaveBeenCalledTimes(1)
            const call = send.mock.calls[0][0]
            expect(call.allowedMentions).toEqual({ parse: [] })
            expect(call.embeds[0].toJSON().image).toEqual({
                url: 'attachment://recap.jpg',
            })
            expect(call.files).toHaveLength(1)
            expect(call.files[0].name).toBe('recap.jpg')
            expect(call.files[0].description).toBe('music.recap.cardAlt')
            expect(call.files[0].attachment).toBe(JPEG)
            expect(fallbackLabelsMock).not.toHaveBeenCalled()
            expect(cardPostedIncMock).toHaveBeenCalledTimes(1)
        })

        it.each(['timeout', 'http_error', 'bad_response', 'network'])(
            'falls back to the text embed on render %s and counts it',
            async (reason) => {
                getWeeklyRecapMock.mockResolvedValue(recap(12))
                renderRecapCardMock.mockResolvedValue({ ok: false, reason })
                const { client, send } = makeClient('text', {
                    perms: ATTACH_PERMS,
                })

                await runTick(client)

                expect(send).toHaveBeenCalledTimes(1)
                textOnly(send.mock.calls[0][0])
                expect(fallbackLabelsMock).toHaveBeenCalledWith(reason)
                expect(fallbackIncMock).toHaveBeenCalledTimes(1)
                expect(cardPostedIncMock).not.toHaveBeenCalled()
                expect(warnLogMock).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: { guildId: 'g-1', reason },
                    }),
                )
                // A render failure is not a send failure.
                expect(releaseRecapWeekMock).not.toHaveBeenCalled()
                expect(disableRecapMock).not.toHaveBeenCalled()
            },
        )

        it.each(['false', '0', ' FALSE '])(
            'RECAP_RENDER_ENABLED=%j posts text only without calling render',
            async (value) => {
                process.env.RECAP_RENDER_ENABLED = value
                getWeeklyRecapMock.mockResolvedValue(recap(12))
                const { client, send } = makeClient('text', {
                    perms: ATTACH_PERMS,
                })

                await runTick(client)

                expect(renderRecapCardMock).not.toHaveBeenCalled()
                textOnly(send.mock.calls[0][0])
                expect(fallbackLabelsMock).toHaveBeenCalledWith('disabled')
                expect(fallbackIncMock).toHaveBeenCalledTimes(1)
                expect(cardPostedIncMock).not.toHaveBeenCalled()
            },
        )

        it('without Attach Files posts text only, keeps the opt-in and skips render', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text') // no AttachFiles

            await runTick(client)

            expect(renderRecapCardMock).not.toHaveBeenCalled()
            expect(send).toHaveBeenCalledTimes(1)
            textOnly(send.mock.calls[0][0])
            expect(fallbackLabelsMock).toHaveBeenCalledWith(
                'no_attach_permission',
            )
            expect(cardPostedIncMock).not.toHaveBeenCalled()
            expect(disableRecapMock).not.toHaveBeenCalled()
            expect(releaseRecapWeekMock).not.toHaveBeenCalled()
        })

        it('a send failure after a good render still follows the release path', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })
            send.mockRejectedValue(new Error('discord down'))

            await runTick(client)

            expect(releaseRecapWeekMock).toHaveBeenCalledWith('g-1', NOW)
            expect(disableRecapMock).not.toHaveBeenCalled()
            expect(cardPostedIncMock).not.toHaveBeenCalled()
        })

        it('retries as text when Attach Files was revoked mid-send, keeping the opt-in', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })
            send.mockRejectedValueOnce({ code: 50013 })

            await runTick(client)

            expect(send).toHaveBeenCalledTimes(2)
            expect(send.mock.calls[0][0].files).toHaveLength(1)
            textOnly(send.mock.calls[1][0])
            expect(fallbackLabelsMock).toHaveBeenCalledWith(
                'no_attach_permission',
            )
            expect(fallbackIncMock).toHaveBeenCalledTimes(1)
            expect(cardPostedIncMock).not.toHaveBeenCalled()
            expect(disableRecapMock).not.toHaveBeenCalled()
            expect(releaseRecapWeekMock).not.toHaveBeenCalled()
        })

        it('clears the channel when the text retry is refused too', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })
            send.mockRejectedValue({ code: 50013 })

            await runTick(client)

            expect(send).toHaveBeenCalledTimes(2)
            expect(disableRecapMock).toHaveBeenCalledWith('g-1', 'c-1')
            expect(releaseRecapWeekMock).not.toHaveBeenCalled()
        })

        it('releases the week when the text retry fails transiently', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })
            send.mockRejectedValueOnce({ code: 50013 }).mockRejectedValueOnce(
                new Error('discord down'),
            )

            await runTick(client)

            expect(releaseRecapWeekMock).toHaveBeenCalledWith('g-1', NOW)
            expect(disableRecapMock).not.toHaveBeenCalled()
        })

        it('does not retry a card send that failed for another reason', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })
            send.mockRejectedValue(new Error('discord down'))

            await runTick(client)

            expect(send).toHaveBeenCalledTimes(1)
            expect(fallbackLabelsMock).not.toHaveBeenCalled()
        })

        it('renders before claiming, so a crash while rendering leaves the week unclaimed', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            const { client } = makeClient('text', { perms: ATTACH_PERMS })

            await runTick(client)

            expect(
                renderRecapCardMock.mock.invocationCallOrder[0],
            ).toBeLessThan(claimRecapWeekMock.mock.invocationCallOrder[0])
        })

        it('a crash during render never reaches the claim', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            renderRecapCardMock.mockRejectedValue(new Error('boom'))
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })

            await runTick(client)

            expect(claimRecapWeekMock).not.toHaveBeenCalled()
            expect(send).not.toHaveBeenCalled()
        })

        it('a lost claim wastes only the render', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(12))
            claimRecapWeekMock.mockResolvedValue(false)
            const { client, send } = makeClient('text', { perms: ATTACH_PERMS })

            await runTick(client)

            expect(renderRecapCardMock).toHaveBeenCalledTimes(1)
            expect(send).not.toHaveBeenCalled()
        })

        it('does not render for a quiet week', async () => {
            getWeeklyRecapMock.mockResolvedValue(recap(2))
            const { client } = makeClient('text', { perms: ATTACH_PERMS })

            await runTick(client)

            expect(renderRecapCardMock).not.toHaveBeenCalled()
            expect(fallbackLabelsMock).not.toHaveBeenCalled()
        })
    })
})
