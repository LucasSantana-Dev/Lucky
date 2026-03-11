import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import serversetupCommand from './serversetup'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    formatCriativariaSummary,
    resolveSetupMode,
    runCriativariaSetup,
} from './serversetupCriativaria'

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('./serversetupCriativaria', () => ({
    resolveSetupMode: jest.fn(),
    runCriativariaSetup: jest.fn(),
    formatCriativariaSummary: jest.fn(),
}))

function createInteraction(options: { template: string; mode: string | null }) {
    return {
        guild: {
            id: '895505900016631839',
            name: 'Criativaria',
        },
        options: {
            getString: jest.fn((name: string, required?: boolean) => {
                if (name === 'template') {
                    return options.template
                }
                if (name === 'mode') {
                    return options.mode
                }
                if (required) {
                    throw new Error(`Missing required option ${name}`)
                }
                return null
            }),
        },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
    } as any
}

describe('serversetup command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('exposes template and mode options with expected choices', () => {
        const json = serversetupCommand.data.toJSON()
        const templateOption = json.options?.find(
            (option) => option.name === 'template',
        )
        const modeOption = json.options?.find(
            (option) => option.name === 'mode',
        )

        const templateChoices =
            templateOption?.choices?.map((choice) => choice.value) ?? []
        const modeChoices =
            modeOption?.choices?.map((choice) => choice.value) ?? []

        expect(templateChoices).toEqual(
            expect.arrayContaining(['forge-space', 'criativaria']),
        )
        expect(modeChoices).toEqual(
            expect.arrayContaining(['apply', 'dry-run']),
        )
    })

    it('runs criativaria template using resolved mode and summary output', async () => {
        ;(resolveSetupMode as jest.Mock).mockReturnValue('dry-run')
        ;(runCriativariaSetup as jest.Mock).mockResolvedValue({
            applied: ['ok'],
            unchanged: [],
            warnings: [],
        })
        ;(formatCriativariaSummary as jest.Mock).mockReturnValue(
            'summary output',
        )

        const interaction = createInteraction({
            template: 'criativaria',
            mode: 'dry-run',
        })

        await serversetupCommand.execute({ interaction } as any)

        expect(resolveSetupMode).toHaveBeenCalledWith('dry-run')
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true })
        expect(runCriativariaSetup).toHaveBeenCalledWith(
            interaction.guild,
            'dry-run',
        )
        expect(formatCriativariaSummary).toHaveBeenCalled()
        expect(interaction.editReply).toHaveBeenCalledWith('summary output')
        expect(interactionReply).not.toHaveBeenCalled()
    })

    it('returns forge-space dry-run preview when mode is dry-run', async () => {
        ;(resolveSetupMode as jest.Mock).mockReturnValue('dry-run')

        const interaction = createInteraction({
            template: 'forge-space',
            mode: 'dry-run',
        })

        await serversetupCommand.execute({ interaction } as any)

        expect(interactionReply).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
                content: expect.objectContaining({
                    content: expect.stringContaining('Forge Space dry-run'),
                    ephemeral: true,
                }),
            }),
        )
        expect(runCriativariaSetup).not.toHaveBeenCalled()
    })
})
