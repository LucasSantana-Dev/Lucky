import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockResolveFeedbackTranslator = jest.fn<(...args: any[]) => any>()
const mockOpenFeedbackModalAndAwaitSubmit = jest.fn<(...args: any[]) => any>()
const mockSubmitFeedback = jest.fn<(...args: any[]) => any>()
jest.mock('../../../services/feedbackService', () => ({
    openFeedbackModalAndAwaitSubmit: mockOpenFeedbackModalAndAwaitSubmit,
    resolveFeedbackTranslator: mockResolveFeedbackTranslator,
    submitFeedback: mockSubmitFeedback,
}))

import feedback from './feedback'

const t = (key: string) => key

function makeInteraction(overrides: Record<string, unknown> = {}) {
    return {
        guild: { id: 'guild-1' },
        user: { id: 'user-1' },
        id: 'interaction-1',
        reply: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    } as any
}

describe('/feedback command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockResolveFeedbackTranslator.mockResolvedValue(t)
    })

    it('rejects DM usage without opening the modal (no DMs, per in-bot-growth ADR)', async () => {
        const interaction = makeInteraction({ guild: null })

        await feedback.execute({ interaction, client: {} as any })

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true }),
        )
        expect(mockOpenFeedbackModalAndAwaitSubmit).not.toHaveBeenCalled()
    })

    it('modal submit happy path: opens the modal and hands the submission to submitFeedback with no context', async () => {
        const interaction = makeInteraction()
        const modalSubmit = { fields: {} }
        mockOpenFeedbackModalAndAwaitSubmit.mockResolvedValue(modalSubmit)

        await feedback.execute({ interaction, client: {} as any })

        expect(mockOpenFeedbackModalAndAwaitSubmit).toHaveBeenCalledWith(
            interaction,
            t,
        )
        expect(mockSubmitFeedback).toHaveBeenCalledWith(modalSubmit, {}, t)
    })

    it('does nothing further when the modal times out or is dismissed', async () => {
        const interaction = makeInteraction()
        mockOpenFeedbackModalAndAwaitSubmit.mockResolvedValue(null)

        await feedback.execute({ interaction, client: {} as any })

        expect(mockSubmitFeedback).not.toHaveBeenCalled()
    })
})
