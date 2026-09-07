import { describe, expect, it, jest } from '@jest/globals'

const mockPipeline = {}
const mockAutoModHandler = {}
const mockSpamHandler = {}
const mockCustomCommandHandler = {}
const mockStarboardSeedHandler = {}
const mockAfkHandler = {}
const mockXpHandler = {}

jest.mock('../pipeline', () => ({
    MessagePipeline: mockPipeline,
}))

jest.mock('../../../functions/automod/handlers/autoModHandler', () => ({
    autoModHandler: mockAutoModHandler,
}))

jest.mock('../../../functions/automod/handlers/spamHandler', () => ({
    spamHandler: mockSpamHandler,
}))

jest.mock('../customCommandHandler', () => ({
    customCommandHandler: mockCustomCommandHandler,
}))

jest.mock('../starboardSeedHandler', () => ({
    starboardSeedHandler: mockStarboardSeedHandler,
}))

jest.mock('../afkHandler', () => ({
    afkHandler: mockAfkHandler,
}))

jest.mock('../xpHandler', () => ({
    xpHandler: mockXpHandler,
}))

describe('handlers/message barrel', () => {
    it('re-exports each handler from its current module location', async () => {
        const barrel = await import('../index')

        expect(barrel.MessagePipeline).toBe(mockPipeline)
        expect(barrel.autoModHandler).toBe(mockAutoModHandler)
        expect(barrel.spamHandler).toBe(mockSpamHandler)
        expect(barrel.customCommandHandler).toBe(mockCustomCommandHandler)
        expect(barrel.starboardSeedHandler).toBe(mockStarboardSeedHandler)
        expect(barrel.afkHandler).toBe(mockAfkHandler)
        expect(barrel.xpHandler).toBe(mockXpHandler)
    })
})
