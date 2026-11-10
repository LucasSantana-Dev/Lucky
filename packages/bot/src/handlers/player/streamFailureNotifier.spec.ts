import { describe, expect, it, jest } from '@jest/globals'
import {
    STREAM_FAILURE_COOLDOWN_MS,
    notifyChannelStreamFailed,
    resetStreamFailureCooldowns,
} from './streamFailureNotifier'

const debugLogMock = jest.fn()
const createErrorEmbedMock = jest.fn(() => ({ type: 'error' }))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('../../utils/general/embeds', () => ({
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
}))

describe('streamFailureNotifier', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetStreamFailureCooldowns()
    })

    it('sends an error embed to the channel when it exists', async () => {
        const channelSendMock = jest.fn().mockResolvedValue({})
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {
                channel: { id: 'ch-1', send: channelSendMock },
            },
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(channelSendMock).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) }),
        )
        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            expect.stringContaining('Could not play track'),
            expect.stringContaining('Test Song'),
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

        const description = (createErrorEmbedMock.mock.calls[0] as unknown[])[1]
        expect(description).toBe(
            "Couldn't find the original of **Test Song** right now, so I'm not playing a cover. Try again shortly or paste a link.",
        )
        expect(description).not.toMatch(
            /soundcloud|youtube|spotify|region|skip/i,
        )
    })

    it('uses "this track" when trackTitle is empty', async () => {
        const channelSendMock = jest.fn().mockResolvedValue({})
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {
                channel: { id: 'ch-1', send: channelSendMock },
            },
        }

        await notifyChannelStreamFailed(queue as any, '')

        expect(createErrorEmbedMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('this track'),
        )
    })

    it('returns early when no channel is available', async () => {
        const queue = {
            guild: { id: 'guild-1' },
            metadata: {},
        }

        await notifyChannelStreamFailed(queue as any, 'Test Song')

        expect(createErrorEmbedMock).not.toHaveBeenCalled()
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
            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                expect.stringContaining('Could not play track'),
                expect.stringContaining('**A**'),
            )
        })

        it('posts one summary when the window closes', async () => {
            const { queue, send } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')
            await notifyChannelStreamFailed(queue as any, 'B')
            await notifyChannelStreamFailed(queue as any, 'C')

            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS)

            expect(send).toHaveBeenCalledTimes(2)
            expect(createErrorEmbedMock).toHaveBeenLastCalledWith(
                expect.any(String),
                expect.stringContaining('2 tracks could not be played'),
            )
            await jest.advanceTimersByTimeAsync(STREAM_FAILURE_COOLDOWN_MS * 2)
            expect(send).toHaveBeenCalledTimes(2)
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
            expect(createErrorEmbedMock).toHaveBeenLastCalledWith(
                expect.stringContaining('Could not play track'),
                expect.stringContaining('**B**'),
            )
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

        it('leaves no timer behind after a reset', async () => {
            const { queue } = makeQueue('g1')
            await notifyChannelStreamFailed(queue as any, 'A')

            resetStreamFailureCooldowns()

            expect(jest.getTimerCount()).toBe(0)
        })
    })
})
