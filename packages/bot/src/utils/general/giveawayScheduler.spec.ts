import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { ChannelType } from 'discord.js'

const mockEndAndDraw = jest.fn()
const mockGetEndedDue = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    giveawayService: {
        endAndDraw: mockEndAndDraw,
        getEndedDue: mockGetEndedDue,
    },
}))
// @lucky/shared/utils' barrel reaches prismaClient's import.meta, which bot
// jest can't compile — mock the log fns the scheduler uses.
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
}))

import { GiveawayScheduler } from './giveawayScheduler'

describe('GiveawayScheduler.processEndedGiveaway', () => {
    let scheduler: GiveawayScheduler
    const mockClient = {
        channels: {
            cache: {
                get: jest.fn(),
            },
            fetch: jest.fn(),
        },
    }

    beforeEach(() => {
        jest.clearAllMocks()
        scheduler = new GiveawayScheduler({ tickIntervalMs: 1000 })
        // Set client via property access
        scheduler['client'] = mockClient as any
    })

    it('finalizes giveaway UP FRONT when no client/messageId', async () => {
        mockEndAndDraw.mockResolvedValueOnce(['user-1'])

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 1,
            messageId: null,
            winnerIds: undefined,
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).toHaveBeenCalledTimes(1)
        expect(mockEndAndDraw).toHaveBeenCalledWith('ga-123', 1)
    })

    it('finalizes when channel fetch fails', async () => {
        mockEndAndDraw.mockResolvedValueOnce(['user-1'])
        mockClient.channels.cache.get.mockReturnValueOnce(null)
        mockClient.channels.fetch.mockRejectedValueOnce(
            new Error('Channel not found'),
        )

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 1,
            messageId: 'msg-123',
            winnerIds: undefined,
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).toHaveBeenCalledTimes(1)
        expect(mockEndAndDraw).toHaveBeenCalledWith('ga-123', 1)
    })

    it('finalizes when channel is not text-based', async () => {
        mockEndAndDraw.mockResolvedValueOnce(['user-1'])
        const mockChannel = { type: ChannelType.DM }
        mockClient.channels.cache.get.mockReturnValueOnce(mockChannel)

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 1,
            messageId: 'msg-123',
            winnerIds: undefined,
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).toHaveBeenCalledTimes(1)
    })

    it('finalizes and announces when message found', async () => {
        mockEndAndDraw.mockResolvedValueOnce(['user-1', 'user-2'])

        const mockMsg = {
            embeds: [],
            edit: jest.fn().mockResolvedValueOnce(undefined),
        }
        const mockChannel = {
            type: ChannelType.GuildText,
            messages: {
                fetch: jest.fn().mockResolvedValueOnce(mockMsg),
            },
            send: jest.fn().mockResolvedValueOnce(undefined),
        }
        mockClient.channels.cache.get.mockReturnValueOnce(mockChannel)

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 2,
            messageId: 'msg-123',
            winnerIds: undefined,
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).toHaveBeenCalledTimes(1)
        expect(mockEndAndDraw).toHaveBeenCalledWith('ga-123', 2)
        expect(mockMsg.edit).toHaveBeenCalled()
        expect(mockChannel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Congratulations'),
                allowedMentions: { users: ['user-1', 'user-2'] },
            }),
        )
    })

    it('finalizes even if message fetch fails', async () => {
        mockEndAndDraw.mockResolvedValueOnce(['user-1'])

        const mockChannel = {
            type: ChannelType.GuildText,
            messages: {
                fetch: jest.fn().mockRejectedValueOnce(new Error('Message not found')),
            },
            send: jest.fn(),
        }
        mockClient.channels.cache.get.mockReturnValueOnce(mockChannel)

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 1,
            messageId: 'msg-123',
            winnerIds: undefined,
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).toHaveBeenCalledTimes(1)
        expect(mockChannel.send).not.toHaveBeenCalled()
    })

    it('uses pre-drawn winners if already present', async () => {
        const mockMsg = {
            embeds: [],
            edit: jest.fn().mockResolvedValueOnce(undefined),
        }
        const mockChannel = {
            type: ChannelType.GuildText,
            messages: {
                fetch: jest.fn().mockResolvedValueOnce(mockMsg),
            },
            send: jest.fn().mockResolvedValueOnce(undefined),
        }
        mockClient.channels.cache.get.mockReturnValueOnce(mockChannel)

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 1,
            messageId: 'msg-123',
            winnerIds: ['user-already-drawn'],
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).not.toHaveBeenCalled()
        expect(mockMsg.edit).toHaveBeenCalled()
    })

    it('announces no-entries case properly', async () => {
        mockEndAndDraw.mockResolvedValueOnce([])

        const mockMsg = {
            embeds: [],
            edit: jest.fn().mockResolvedValueOnce(undefined),
        }
        const mockChannel = {
            type: ChannelType.GuildText,
            messages: {
                fetch: jest.fn().mockResolvedValueOnce(mockMsg),
            },
            send: jest.fn().mockResolvedValueOnce(undefined),
        }
        mockClient.channels.cache.get.mockReturnValueOnce(mockChannel)

        const giveaway = {
            id: 'ga-123',
            channelId: 'ch-123',
            prize: 'Prize',
            winnersCount: 1,
            messageId: 'msg-123',
            winnerIds: undefined,
        }

        await scheduler['processEndedGiveaway'](giveaway)

        expect(mockEndAndDraw).toHaveBeenCalledTimes(1)
        expect(mockChannel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('No valid entries'),
            }),
        )
    })
})
