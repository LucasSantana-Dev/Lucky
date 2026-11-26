import { MessageFlags, PermissionFlagsBits } from 'discord.js'

const prisma = {
    activationEvent: { findFirst: jest.fn() },
    trackHistory: { count: jest.fn() },
}
const recordActivationEventMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => prisma,
    infoLog: (...a: unknown[]) => infoLogMock(...a),
    errorLog: (...a: unknown[]) => errorLogMock(...a),
}))
jest.mock('@lucky/shared/services', () => ({
    recordActivationEvent: (...a: unknown[]) => recordActivationEventMock(...a),
}))
jest.mock('@lucky/shared/constants', () => ({
    SUPPORT_SERVER_INVITE_URL: 'https://discord.gg/example',
}))
jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))
jest.mock('../feedbackService', () => ({
    buildFeedbackReportCustomId: (name: string) => `feedback_report:${name}:`,
}))

import {
    ADMIN_PROMPT_COOLDOWN_MS,
    maybeAskAdminForFeedback,
    resetAdminFeedbackPromptState,
} from './adminFeedbackPrompt'

const NOW = new Date('2026-11-26T12:00:00.000Z')

function interactionFor({
    commandName = 'play',
    admin = true,
    replied = true,
    guildId = 'guild-1',
}: {
    commandName?: string
    admin?: boolean
    replied?: boolean
    guildId?: string | null
} = {}) {
    const followUp = jest.fn().mockResolvedValue(undefined)
    const interaction = {
        guildId,
        commandName,
        replied,
        deferred: false,
        memberPermissions: {
            has: (flag: bigint) =>
                admin && flag === PermissionFlagsBits.ManageGuild,
        },
        followUp,
    }
    return { interaction: interaction as never, followUp }
}

describe('admin feedback prompt', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetAdminFeedbackPromptState()
        prisma.activationEvent.findFirst.mockResolvedValue(null)
        prisma.trackHistory.count.mockResolvedValue(12)
        recordActivationEventMock.mockResolvedValue(true)
    })

    it('asks an admin once, ephemerally, recording it before the send', async () => {
        const { interaction, followUp } = interactionFor()

        await expect(maybeAskAdminForFeedback(interaction, NOW)).resolves.toBe(
            true,
        )

        expect(prisma.activationEvent.findFirst).toHaveBeenCalledWith({
            where: {
                guildDiscordId: 'guild-1',
                kind: 'admin_feedback_prompt',
                occurredAt: {
                    gte: new Date(NOW.getTime() - ADMIN_PROMPT_COOLDOWN_MS),
                },
            },
            select: { id: true },
        })
        expect(recordActivationEventMock).toHaveBeenCalledWith(
            'guild-1',
            'admin_feedback_prompt',
            'play',
        )
        expect(followUp).toHaveBeenCalledTimes(1)
        expect(
            recordActivationEventMock.mock.invocationCallOrder[0],
        ).toBeLessThan(followUp.mock.invocationCallOrder[0])
        const message = followUp.mock.calls[0][0]
        expect(message.flags).toBe(MessageFlags.Ephemeral)
        expect(message.embeds[0].toJSON()).toEqual(
            expect.objectContaining({
                title: 'music.adminPrompt.title',
                description: 'music.adminPrompt.description',
            }),
        )
        const buttons = message.components[0].toJSON().components
        expect(buttons[0].custom_id).toBe('feedback_report:admin_prompt:')
        expect(buttons[1].url).toBe('https://discord.gg/example')
    })

    it('does not ask a member without Manage Server', async () => {
        const { interaction, followUp } = interactionFor({ admin: false })

        await expect(maybeAskAdminForFeedback(interaction, NOW)).resolves.toBe(
            false,
        )

        expect(followUp).not.toHaveBeenCalled()
        expect(prisma.activationEvent.findFirst).not.toHaveBeenCalled()
    })

    it('ignores commands outside the music set and direct messages', async () => {
        const other = interactionFor({ commandName: 'ban' })
        const dm = interactionFor({ guildId: null })

        await maybeAskAdminForFeedback(other.interaction, NOW)
        await maybeAskAdminForFeedback(dm.interaction, NOW)

        expect(other.followUp).not.toHaveBeenCalled()
        expect(dm.followUp).not.toHaveBeenCalled()
        expect(prisma.activationEvent.findFirst).not.toHaveBeenCalled()
    })

    it('waits for an acknowledged interaction', async () => {
        const { interaction, followUp } = interactionFor({ replied: false })

        await maybeAskAdminForFeedback(interaction, NOW)

        expect(followUp).not.toHaveBeenCalled()
    })

    it('does not ask again inside the 30 days', async () => {
        prisma.activationEvent.findFirst.mockResolvedValue({ id: 1 })
        const { interaction, followUp } = interactionFor()

        await maybeAskAdminForFeedback(interaction, NOW)

        expect(followUp).not.toHaveBeenCalled()
        expect(recordActivationEventMock).not.toHaveBeenCalled()
    })

    it('does not ask a guild that barely played', async () => {
        prisma.trackHistory.count.mockResolvedValue(4)
        const { interaction, followUp } = interactionFor()

        await maybeAskAdminForFeedback(interaction, NOW)

        expect(prisma.trackHistory.count).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
        })
        expect(followUp).not.toHaveBeenCalled()
        expect(recordActivationEventMock).not.toHaveBeenCalled()
    })

    it('checks a guild at most once an hour', async () => {
        prisma.trackHistory.count.mockResolvedValue(4)
        const first = interactionFor()
        const second = interactionFor()

        await maybeAskAdminForFeedback(first.interaction, NOW)
        await maybeAskAdminForFeedback(
            second.interaction,
            new Date(NOW.getTime() + 10 * 60 * 1000),
        )

        expect(prisma.activationEvent.findFirst).toHaveBeenCalledTimes(1)
    })

    it('sends nothing when the prompt could not be recorded', async () => {
        recordActivationEventMock.mockResolvedValue(false)
        const { interaction, followUp } = interactionFor()

        await maybeAskAdminForFeedback(interaction, NOW)

        expect(followUp).not.toHaveBeenCalled()
    })

    it('logs a failed send and does not throw', async () => {
        const { interaction, followUp } = interactionFor()
        followUp.mockRejectedValue(new Error('network'))

        await expect(maybeAskAdminForFeedback(interaction, NOW)).resolves.toBe(
            false,
        )

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'admin feedback prompt: failed',
            }),
        )
    })
})
