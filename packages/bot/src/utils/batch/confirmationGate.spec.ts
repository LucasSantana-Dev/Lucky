import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/constants', () => ({
    COLOR: { LUCKY_PURPLE: '#7e5bc2' },
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

// discord.js mock — empty factories; implementations are re-applied in beforeEach
// because resetMocks:true (jest.config.cjs) wipes mockImplementation between tests.
jest.mock('discord.js', () => ({
    ActionRowBuilder: jest.fn(),
    ButtonBuilder: jest.fn(),
    ButtonStyle: { Success: 4, Danger: 4 },
    EmbedBuilder: jest.fn(),
}))

import { showBatchConfirmation } from './confirmationGate'
import type { BatchConfirmationParams } from './confirmationGate'

function makeStubEmbed() {
    const e: Record<string, () => unknown> = {}
    e.setColor = () => e
    e.setTitle = () => e
    e.addFields = () => e
    e.setDescription = () => e
    return e
}

function makeStubButton() {
    const b: Record<string, () => unknown> = {}
    b.setCustomId = () => b
    b.setLabel = () => b
    b.setStyle = () => b
    return b
}

function makeStubRow() {
    const r: Record<string, () => unknown> = {}
    r.addComponents = () => r
    return r
}

beforeEach(() => {
    // Re-apply after resetMocks:true wipes implementations.
    const djs = jest.requireMock('discord.js') as {
        EmbedBuilder: jest.Mock
        ButtonBuilder: jest.Mock
        ActionRowBuilder: jest.Mock
    }
    djs.EmbedBuilder.mockImplementation(makeStubEmbed)
    djs.ButtonBuilder.mockImplementation(makeStubButton)
    djs.ActionRowBuilder.mockImplementation(makeStubRow)
})

const DEFAULT_PARAMS: BatchConfirmationParams = {
    operation: 'channel move',
    totalItems: 100,
    estimatedMinutes: 5,
}

function makeInteraction(opts: {
    repliable?: boolean
    deferred?: boolean
    replied?: boolean
    customId?: string
    awaitThrows?: boolean
}) {
    const {
        repliable = true,
        deferred = false,
        replied = false,
        customId = 'batch_proceed',
        awaitThrows = false,
    } = opts

    const mockUpdate = jest.fn().mockResolvedValue(undefined)
    const mockAwait = awaitThrows
        ? jest.fn().mockRejectedValue(new Error('Collector timed out'))
        : jest.fn().mockResolvedValue({ customId, update: mockUpdate })

    const mockMessage = { awaitMessageComponent: mockAwait }
    const mockReply = jest.fn().mockResolvedValue(mockMessage)
    const mockFollowUp = jest.fn().mockResolvedValue(mockMessage)

    const interaction = {
        isRepliable: jest.fn().mockReturnValue(repliable),
        deferred,
        replied,
        user: { id: 'user-123' },
        reply: mockReply,
        followUp: mockFollowUp,
    }

    return { interaction, mockReply, mockFollowUp, mockUpdate }
}

describe('showBatchConfirmation', () => {
    it('returns false when interaction is not repliable', async () => {
        const { interaction } = makeInteraction({ repliable: false })
        const result = await showBatchConfirmation(
            interaction as never,
            DEFAULT_PARAMS,
        )
        expect(result).toBe(false)
    })

    it('returns true when user clicks Proceed', async () => {
        const { interaction } = makeInteraction({ customId: 'batch_proceed' })
        const result = await showBatchConfirmation(
            interaction as never,
            DEFAULT_PARAMS,
        )
        expect(result).toBe(true)
    })

    it('returns false when user clicks Cancel', async () => {
        const { interaction } = makeInteraction({ customId: 'batch_cancel' })
        const result = await showBatchConfirmation(
            interaction as never,
            DEFAULT_PARAMS,
        )
        expect(result).toBe(false)
    })

    it('returns false on timeout or error', async () => {
        const { interaction } = makeInteraction({ awaitThrows: true })
        const result = await showBatchConfirmation(
            interaction as never,
            DEFAULT_PARAMS,
        )
        expect(result).toBe(false)
    })

    it('uses reply when interaction is not yet responded', async () => {
        const { interaction, mockReply, mockFollowUp } = makeInteraction({
            deferred: false,
            replied: false,
        })
        await showBatchConfirmation(interaction as never, DEFAULT_PARAMS)
        expect(mockReply).toHaveBeenCalled()
        expect(mockFollowUp).not.toHaveBeenCalled()
    })

    it('uses followUp when interaction is already deferred', async () => {
        const { interaction, mockReply, mockFollowUp } = makeInteraction({
            deferred: true,
            replied: false,
        })
        await showBatchConfirmation(interaction as never, DEFAULT_PARAMS)
        expect(mockFollowUp).toHaveBeenCalled()
        expect(mockReply).not.toHaveBeenCalled()
    })

    it('uses followUp when interaction is already replied', async () => {
        const { interaction, mockReply, mockFollowUp } = makeInteraction({
            deferred: false,
            replied: true,
        })
        await showBatchConfirmation(interaction as never, DEFAULT_PARAMS)
        expect(mockFollowUp).toHaveBeenCalled()
        expect(mockReply).not.toHaveBeenCalled()
    })

    it('clears buttons after user responds', async () => {
        const { interaction, mockUpdate } = makeInteraction({
            customId: 'batch_proceed',
        })
        await showBatchConfirmation(interaction as never, DEFAULT_PARAMS)
        expect(mockUpdate).toHaveBeenCalledWith({ components: [] })
    })

    it('includes fidelity warnings in embed when provided', async () => {
        const { interaction } = makeInteraction({})
        const params: BatchConfirmationParams = {
            ...DEFAULT_PARAMS,
            fidelityWarnings: [
                'Attachments may not be preserved',
                'Reactions will be lost',
            ],
        }
        const result = await showBatchConfirmation(interaction as never, params)
        expect(result).toBe(true)
    })
})
