import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Message } from 'discord.js'
import { starboardSeedHandler } from '../starboardSeedHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    starboardService: { getConfig: jest.fn() },
}))
jest.mock('@lucky/shared/utils', () => ({ errorLog: jest.fn() }))

import { starboardService } from '@lucky/shared/services'

const context: MessageContext = {
    guild: { id: 'g1' } as never,
    member: {} as never,
    featureToggles: {},
}

function makeMessage(channelId = 'chan-1') {
    const react = jest.fn().mockResolvedValue(undefined)
    return {
        message: {
            author: { bot: false },
            channelId,
            react,
        } as unknown as Message,
        react,
    }
}

const baseConfig = {
    channelId: 'starboard-chan',
    emoji: '⭐',
    threshold: 3,
    selfStar: false,
    seedReaction: true,
    seedChannelIds: [] as string[],
    firstStarDm: false,
    firstStarDmMessage: null,
}

describe('starboardSeedHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('does not seed when seedReaction is off', async () => {
        ;(starboardService.getConfig as jest.Mock).mockResolvedValue({
            ...baseConfig,
            seedReaction: false,
        })
        const { message, react } = makeMessage()
        await starboardSeedHandler.handle(message, context)
        expect(react).not.toHaveBeenCalled()
    })

    it('seeds the configured emoji in any channel when list is empty', async () => {
        ;(starboardService.getConfig as jest.Mock).mockResolvedValue(baseConfig)
        const { message, react } = makeMessage()
        await starboardSeedHandler.handle(message, context)
        expect(react).toHaveBeenCalledWith('⭐')
    })

    it('never seeds the starboard channel itself', async () => {
        ;(starboardService.getConfig as jest.Mock).mockResolvedValue(baseConfig)
        const { message, react } = makeMessage('starboard-chan')
        await starboardSeedHandler.handle(message, context)
        expect(react).not.toHaveBeenCalled()
    })

    it('respects the channel allow-list when non-empty', async () => {
        ;(starboardService.getConfig as jest.Mock).mockResolvedValue({
            ...baseConfig,
            seedChannelIds: ['other-chan'],
        })
        const { message, react } = makeMessage('chan-1')
        await starboardSeedHandler.handle(message, context)
        expect(react).not.toHaveBeenCalled()

        const allowed = makeMessage('other-chan')
        await starboardSeedHandler.handle(allowed.message, context)
        expect(allowed.react).toHaveBeenCalledWith('⭐')
    })

    it('skips bot authors via canHandle', async () => {
        const botMsg = {
            author: { bot: true },
        } as unknown as Message
        expect(await starboardSeedHandler.canHandle(botMsg, context)).toBe(
            false,
        )
    })

    it('never stops the pipeline, even when getConfig throws', async () => {
        ;(starboardService.getConfig as jest.Mock).mockRejectedValue(
            new Error('db down'),
        )
        const { message } = makeMessage()
        const result = await starboardSeedHandler.handle(message, context)
        expect(result).toEqual({ stop: false })
    })
})
