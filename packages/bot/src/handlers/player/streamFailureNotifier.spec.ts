import { describe, expect, it, jest } from '@jest/globals'
import { notifyChannelStreamFailed } from './streamFailureNotifier'

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
})
