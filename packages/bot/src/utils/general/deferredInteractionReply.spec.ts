import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

import { deferredInteractionReply } from './deferredInteractionReply'

function makeInteraction(
    overrides: Partial<{
        deferred: boolean
        replied: boolean
        deferReply: jest.Mock
        followUp: jest.Mock
        editReply: jest.Mock
    }> = {},
) {
    return {
        deferred: false,
        replied: false,
        deferReply: jest.fn().mockResolvedValue(undefined),
        followUp: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

describe('deferredInteractionReply', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('defers then edits when not deferred and not replied', async () => {
        const interaction = makeInteraction({ deferred: false, replied: false })
        await deferredInteractionReply(interaction as never, {
            content: 'Hello',
        })
        expect(interaction.deferReply).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Hello' })
        expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('passes ephemeral flag when deferring', async () => {
        const interaction = makeInteraction({ deferred: false, replied: false })
        await deferredInteractionReply(interaction as never, {
            content: 'Hi',
            ephemeral: true,
        })
        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 })
    })

    it('defers without flags for non-ephemeral', async () => {
        const interaction = makeInteraction({ deferred: false, replied: false })
        await deferredInteractionReply(interaction as never, { content: 'Hi' })
        expect(interaction.deferReply).toHaveBeenCalledWith({
            flags: undefined,
        })
    })

    it('calls followUp when already replied', async () => {
        const interaction = makeInteraction({ deferred: true, replied: true })
        await deferredInteractionReply(interaction as never, {
            content: 'Follow up',
        })
        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledWith({
            content: 'Follow up',
        })
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('calls editReply when deferred but not replied', async () => {
        const interaction = makeInteraction({ deferred: true, replied: false })
        await deferredInteractionReply(interaction as never, {
            content: 'Edit',
        })
        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Edit' })
        expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('logs error and does not throw when interaction throws', async () => {
        const interaction = makeInteraction({
            deferred: true,
            replied: false,
            editReply: jest
                .fn()
                .mockRejectedValue(new Error('interaction expired')),
        })
        await expect(
            deferredInteractionReply(interaction as never, { content: 'x' }),
        ).resolves.not.toThrow()
        expect(errorLogMock).toHaveBeenCalled()
    })
})
