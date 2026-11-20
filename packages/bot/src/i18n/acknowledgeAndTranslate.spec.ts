import type { ChatInputCommandInteraction } from 'discord.js'
import { acknowledgeAndTranslate } from './acknowledgeAndTranslate'

jest.mock('@lucky/shared/utils', () => ({ debugLog: jest.fn() }))
const translatorMock = jest.fn()
jest.mock('./translatorForInteraction', () => ({
    translatorForInteraction: (...args: unknown[]) => translatorMock(...args),
}))

const make = (over: Record<string, unknown> = {}) =>
    ({
        deferred: false,
        replied: false,
        guildId: 'g1',
        deferReply: jest.fn().mockResolvedValue(undefined),
        ...over,
    }) as unknown as ChatInputCommandInteraction

describe('acknowledgeAndTranslate', () => {
    beforeEach(() => translatorMock.mockReset().mockResolvedValue('T'))

    it('defers before resolving the translator', async () => {
        const order: string[] = []
        const i = make({
            deferReply: jest.fn(async () => void order.push('defer')),
        })
        translatorMock.mockImplementation(async () => {
            order.push('translate')
            return 'T'
        })
        await expect(acknowledgeAndTranslate(i)).resolves.toBe('T')
        expect(order).toEqual(['defer', 'translate'])
    })

    it('does not defer twice', async () => {
        const i = make({ deferred: true })
        await acknowledgeAndTranslate(i)
        expect(i.deferReply).not.toHaveBeenCalled()
    })

    it('still translates when the defer fails', async () => {
        const i = make({
            deferReply: jest.fn().mockRejectedValue(new Error('10062')),
        })
        await expect(acknowledgeAndTranslate(i)).resolves.toBe('T')
    })
})
