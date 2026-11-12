import { describe, expect, it, jest } from '@jest/globals'
import type { EmbedBuilder } from 'discord.js'
import {
    STREAM_FAILURE_COOLDOWN_MS,
    buildMusicNoticeEmbed,
    buildStreamFailedEmbed,
    notifyChannelAutoplayStopped,
    notifyChannelStreamFailed,
    resetStreamFailureCooldowns,
} from './streamFailureNotifier'
import { translatorFor } from '../../i18n'

const debugLogMock = jest.fn()
const translatorForInteractionMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('../../utils/general/embeds', () => ({
    EMBED_COLORS: { ERROR: '#F44336' },
}))

jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: (...args: unknown[]) =>
        translatorForInteractionMock(...args),
}))

type Payload = { embeds: EmbedBuilder[] }

function descriptionOf(send: jest.Mock, call = 0): string | undefined {
    return (send.mock.calls[call][0] as Payload).embeds[0].data.description
}

function lastDescription(send: jest.Mock): string | undefined {
    return descriptionOf(send, send.mock.calls.length - 1)
}

describe('streamFailureNotifier', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetStreamFailureCooldowns()
        translatorForInteractionMock.mockResolvedValue(translatorFor('en'))
    })

    describe('buildMusicNoticeEmbed', () => {
        it('is one warning line, with no title or timestamp', () => {
            const { data } = buildMusicNoticeEmbed('Something broke.')

            expect(data.description).toBe('⚠️ Something broke.')
            expect(data.title).toBeUndefined()
            expect(data.timestamp).toBeUndefined()
            expect(data.color).toBe(0xf44336)
        })
    })

    describe('buildStreamFailedEmbed', () => {
        it('translates the message', () => {
            const { data } = buildStreamFailedEmbed(
                'Garota de Ipanema',
                translatorFor('pt-BR'),
            )

            expect(data.description).toBe(
                '⚠️ Não achei a original de **Garota de Ipanema** agora, então não vou tocar um cover. Tente de novo em instantes ou cole um link.',
            )
        })

        it('keeps the title as discord-player escaped it, without escaping it again', () => {
            // Track.title arrives already run through escapeMarkdown.
            const { data } = buildStreamFailedEmbed(
                'Song \\*live\\*',
                translatorFor('en'),
            )

            expect(data.description).toContain('**Song \\*live\\***')
        })
    })

    it('sends a one-line notice to the channel when it exists', async () => {
        const channelSendMock = jest.fn().mockResolvedValue({})
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {
                channel: { id: 'ch-1', send: channelSendMock },
            },
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(descriptionOf(channelSendMock)).toBe(
            "⚠️ Couldn't find the original of **Test Song** right now, so I'm not playing a cover. Try again shortly or paste a link.",
        )
    })

    it('uses the language of the queue guild', async () => {
        translatorForInteractionMock.mockResolvedValue(translatorFor('es'))
        const channelSendMock = jest.fn().mockResolvedValue({})
        const guild = { id: 'guild-1' }
        const queue = {
            guild,
            metadata: {
                channel: { id: 'ch-1', send: channelSendMock },
            },
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(translatorForInteractionMock).toHaveBeenCalledWith({
            guildId: 'guild-1',
            guild,
        })
        expect(descriptionOf(channelSendMock)).toContain(
            'No encontré la versión original de **Test Song**',
        )
    })

    it('never names a source, blames the region or claims a skip', async () => {
        const channelSendMock = jest.fn().mockResolvedValue({})
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {
                channel: { id: 'ch-1', send: channelSendMock },
            },
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(descriptionOf(channelSendMock)).not.toMatch(
            /soundcloud|youtube|spotify|region|skip/i,
        )
    })

    it('uses "Unknown track" when trackTitle is empty', async () => {
        const channelSendMock = jest.fn().mockResolvedValue({})
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {
                channel: { id: 'ch-1', send: channelSendMock },
            },
        }

        await notifyChannelStreamFailed(queue as any, '')

        expect(descriptionOf(channelSendMock)).toContain('**Unknown track**')
    })

    it('returns early when no channel is available', async () => {
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {},
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(translatorForInteractionMock).not.toHaveBeenCalled()
    })

    it('logs errors when channel.send fails', async () => {
        const sendError = new Error('missing access')
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {
                channel: {
                    id: 'ch-1',
                    send: jest.fn().mockRejectedValue(sendError),
                },
            },
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(debugLogMock).toHaveBeenCalledWith({
            message: 'Failed to notify channel about stream failure',
            error: sendError,
            data: {
                guildId: 'guild-1',
                trackTitle: 'Test Song',
            },
        })
    })

    describe('notifyChannelAutoplayStopped', () => {
        it('sends a one-line notice in the guild language with the failure count', async () => {
            translatorForInteractionMock.mockResolvedValue(
                translatorFor('pt-BR'),
            )
            const send = jest.fn().mockResolvedValue({})
            const queue = {
                guild: { id: 'guild-1' },
                metadata: { channel: { id: 'ch-1', send } },
            }

            await notifyChannelAutoplayStopped(queue as any, 5)

            expect(descriptionOf(send)).toBe(
                '⚠️ As últimas 5 músicas do autoplay não puderam ser tocadas, então o autoplay parou. Use /play para recomeçar.',
            )
        })

        it('uses the singular for one failed track', async () => {
            const send = jest.fn().mockResolvedValue({})
            const queue = {
                guild: { id: 'guild-1' },
                metadata: { channel: { id: 'ch-1', send } },
            }

            await notifyChannelAutoplayStopped(queue as any, 1)

            expect(descriptionOf(send)).toBe(
                "⚠️ The last autoplay track couldn't be streamed, so autoplay stopped. Use /play to start again.",
            )
        })

        it('returns early when no channel is available', async () => {
            await notifyChannelAutoplayStopped(
                { guild: { id: 'guild-1' }, metadata: {} } as any,
                5,
            )

            expect(translatorForInteractionMock).not.toHaveBeenCalled()
        })
    })

    describe('per-guild cooldown (#2975)', () => {
        const makeQueue = (guildId: string) => {
            const send = jest.fn().mockResolvedValue({})
            return {
                send,
                queue: {
                    guild: { id: guildId },
                    metadata: { channel: { id: `ch-${guildId}`, send } },
                },
            }
        }

        beforeEach(() => jest.useFakeTimers())
        afterEach(() => jest.useRealTimers())

        it('posts the first failure at once and holds the rest', async () => {
            const { queue, send } = makeQueue('g1')

            await notifyChannelStreamFailed(queue as any, 'A')
            await notifyChannelStreamFailed(queue as any, 'B')
            await notifyChannelStreamFailed(queue as any, 'C')

            expect(send).toHaveBeenCalledTimes(1)
            expect(descriptionOf(send)).toContain('**A**')
        })

        it('posts one summary when the window closes', async () => {
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')
            await notifyChannelStreamFailed(queue as any, 'B')
            await notifyChannelStreamFailed(queue as any, 'C')

            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(send).toHaveBeenCalledTimes(2)
            expect(lastDescription(send)).toBe(
                "⚠️ 2 tracks couldn't be played. Try again shortly or paste a link.",
            )
            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS * 2)
            expect(send).toHaveBeenCalledTimes(2)
        })

        it('writes the summary in the guild language', async () => {
            translatorForInteractionMock.mockResolvedValue(translatorFor('es'))
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')
            await notifyChannelStreamFailed(queue as any, 'B')
            await notifyChannelStreamFailed(queue as any, 'C')

            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(lastDescription(send)).toBe(
                '⚠️ No se pudieron reproducir 2 canciones. Inténtalo de nuevo en un momento o pega un enlace.',
            )
        })

        it('uses the singular in a summary of one', async () => {
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')
            await notifyChannelStreamFailed(queue as any, 'B')

            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(lastDescription(send)).toBe(
                "⚠️ 1 track couldn't be played. Try again shortly or paste a link.",
            )
        })

        it('posts no summary when nothing was held back', async () => {
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')

            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(send).toHaveBeenCalledTimes(1)
        })

        it('posts the next failure at once after the window is over', async () => {
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')
            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            await notifyChannelStreamFailed(queue as any, 'B')

            expect(send).toHaveBeenCalledTimes(2)
            expect(lastDescription(send)).toContain('**B**')
        })

        it('keeps guilds apart', async () => {
            const one = makeQueue('g1')
            const two = makeQueue('g2')

            await notifyChannelStreamFailed(one.queue as any, 'A')
            await notifyChannelStreamFailed(one.queue as any, 'B')
            await notifyChannelStreamFailed(two.queue as any, 'C')

            expect(one.send).toHaveBeenCalledTimes(1)
            expect(two.send).toHaveBeenCalledTimes(1)

            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(one.send).toHaveBeenCalledTimes(2)
            expect(two.send).toHaveBeenCalledTimes(1)
        })

        it('skips the summary when the queue was deleted meanwhile', async () => {
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')
            await notifyChannelStreamFailed(queue as any, 'B')

            ;(queue as any).deleted = true
            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(send).toHaveBeenCalledTimes(1)
            expect(jest.getTimerCount()).toBe(0)
        })

        it('leaves no timer behind after a reset', async () => {
            const { queue } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')

            resetStreamFailureCooldowns()

            expect(jest.getTimerCount()).toBe(0)
        })
    })
})
