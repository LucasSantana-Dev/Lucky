import { describe, expect, it, jest } from '@jest/globals'

const mockPipeline = {}
const mockSpamHandler = {}
const mockAfkHandler = {}
const mockXpHandler = {}

jest.mock('../pipeline', () => ({
    MessagePipeline: mockPipeline,
}))

jest.mock('../../../functions/automod/handlers/spamHandler', () => ({
    spamHandler: mockSpamHandler,
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
        expect(barrel.spamHandler).toBe(mockSpamHandler)
        expect(barrel.afkHandler).toBe(mockAfkHandler)
        expect(barrel.xpHandler).toBe(mockXpHandler)
    })
})
