import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockResolveFeedbackTranslator = jest.fn<(...args: any[]) => any>()
const mockOpenFeedbackModalAndAwaitSubmit = jest.fn<(...args: any[]) => any>()
const mockSubmitFeedback = jest.fn<(...args: any[]) => any>()
const mockParseFeedbackReportCustomId = jest.fn<(...args: any[]) => any>()
// The encode/decode round trip itself is covered by feedbackService.spec.ts;
// here parseFeedbackReportCustomId is a plain mock so this file stays isolated
// from feedbackService's real dependency chain (@lucky/shared/utils, which
// this package's jest config only tolerates when explicitly mocked).
jest.mock('../services/feedbackService', () => ({
    openFeedbackModalAndAwaitSubmit: mockOpenFeedbackModalAndAwaitSubmit,
    parseFeedbackReportCustomId: mockParseFeedbackReportCustomId,
    resolveFeedbackTranslator: mockResolveFeedbackTranslator,
    submitFeedback: mockSubmitFeedback,
}))

import { handleFeedbackReportButton } from './feedbackButtonHandler'

const t = (key: string) => key

function makeButtonInteraction(
    customId: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        customId,
        guildId: 'guild-1',
        user: { id: 'user-1' },
        id: 'interaction-1',
        ...overrides,
    } as any
}

describe('handleFeedbackReportButton', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockResolveFeedbackTranslator.mockResolvedValue(t)
    })

    it('carries the failed command name and Sentry event id into the feedback context', async () => {
        mockParseFeedbackReportCustomId.mockReturnValue({
            commandName: 'play',
            sentryEventId: 'sentry-evt-1',
        })
        const interaction = makeButtonInteraction(
            'feedback_report:play:sentry-evt-1',
        )
        const modalSubmit = { fields: {} }
        mockOpenFeedbackModalAndAwaitSubmit.mockResolvedValue(modalSubmit)

        await handleFeedbackReportButton(interaction)

        expect(mockOpenFeedbackModalAndAwaitSubmit).toHaveBeenCalledWith(
            interaction,
            t,
        )
        expect(mockSubmitFeedback).toHaveBeenCalledWith(
            modalSubmit,
            { commandName: 'play', sentryEventId: 'sentry-evt-1' },
            t,
        )
    })

    it('carries the command name with an undefined Sentry id when Sentry was disabled', async () => {
        mockParseFeedbackReportCustomId.mockReturnValue({
            commandName: 'queue',
            sentryEventId: undefined,
        })
        const interaction = makeButtonInteraction('feedback_report:queue:')
        const modalSubmit = { fields: {} }
        mockOpenFeedbackModalAndAwaitSubmit.mockResolvedValue(modalSubmit)

        await handleFeedbackReportButton(interaction)

        expect(mockSubmitFeedback).toHaveBeenCalledWith(
            modalSubmit,
            { commandName: 'queue', sentryEventId: undefined },
            t,
        )
    })

    it('does nothing when the button fires outside a guild (no DMs)', async () => {
        const interaction = makeButtonInteraction(
            'feedback_report:play:sentry-evt-1',
            { guildId: null },
        )

        await handleFeedbackReportButton(interaction)

        expect(mockOpenFeedbackModalAndAwaitSubmit).not.toHaveBeenCalled()
        expect(mockSubmitFeedback).not.toHaveBeenCalled()
    })

    it('does not submit when the modal times out or is dismissed', async () => {
        mockParseFeedbackReportCustomId.mockReturnValue({
            commandName: 'play',
            sentryEventId: 'sentry-evt-1',
        })
        const interaction = makeButtonInteraction(
            'feedback_report:play:sentry-evt-1',
        )
        mockOpenFeedbackModalAndAwaitSubmit.mockResolvedValue(null)

        await handleFeedbackReportButton(interaction)

        expect(mockSubmitFeedback).not.toHaveBeenCalled()
    })
})
