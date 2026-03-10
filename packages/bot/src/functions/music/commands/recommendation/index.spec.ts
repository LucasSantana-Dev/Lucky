import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import recommendationCommand from './index'

const requireGuildMock = jest.fn()
const handleShowSettingsMock = jest.fn()
const handleUpdateSettingsMock = jest.fn()
const handleApplyPresetMock = jest.fn()
const handleResetSettingsMock = jest.fn()
const handleFeedbackMock = jest.fn()

jest.mock('../../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('./handlers', () => ({
    handleShowSettings: (...args: unknown[]) => handleShowSettingsMock(...args),
    handleUpdateSettings: (...args: unknown[]) => handleUpdateSettingsMock(...args),
    handleApplyPreset: (...args: unknown[]) => handleApplyPresetMock(...args),
    handleResetSettings: (...args: unknown[]) => handleResetSettingsMock(...args),
    handleFeedback: (...args: unknown[]) => handleFeedbackMock(...args),
}))

function createInteraction(subcommand: string) {
    return {
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
        reply: jest.fn(),
    } as any
}

describe('recommendation command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
    })

    it('returns early when guild validation fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await recommendationCommand.execute({
            client: {},
            interaction: createInteraction('show'),
        } as any)

        expect(handleShowSettingsMock).not.toHaveBeenCalled()
    })

    it('routes show/update/preset/reset subcommands to handlers', async () => {
        await recommendationCommand.execute({
            client: {},
            interaction: createInteraction('show'),
        } as any)
        await recommendationCommand.execute({
            client: {},
            interaction: createInteraction('update'),
        } as any)
        await recommendationCommand.execute({
            client: {},
            interaction: createInteraction('preset'),
        } as any)
        await recommendationCommand.execute({
            client: {},
            interaction: createInteraction('reset'),
        } as any)

        expect(handleShowSettingsMock).toHaveBeenCalledTimes(1)
        expect(handleUpdateSettingsMock).toHaveBeenCalledTimes(1)
        expect(handleApplyPresetMock).toHaveBeenCalledTimes(1)
        expect(handleResetSettingsMock).toHaveBeenCalledTimes(1)
    })

    it('routes feedback subcommand with interaction and client', async () => {
        const client = { marker: 'client' }
        const interaction = createInteraction('feedback')

        await recommendationCommand.execute({
            client,
            interaction,
        } as any)

        expect(handleFeedbackMock).toHaveBeenCalledWith(interaction, client)
    })

    it('replies for unknown subcommand', async () => {
        const interaction = createInteraction('unknown')

        await recommendationCommand.execute({
            client: {},
            interaction,
        } as any)

        expect(interaction.reply).toHaveBeenCalledWith({
            content: 'Unknown subcommand.',
            ephemeral: true,
        })
    })
})
