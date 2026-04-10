import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import autoroleCommand from './autorole'

const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, description: string) => ({ type: 'success', title, description }))
const createErrorEmbedMock = jest.fn((title: string, description: string) => ({ type: 'error', title, description }))
const createInfoEmbedMock = jest.fn((title: string, description: string) => ({ type: 'info', title, description }))
const buildListPageEmbedMock = jest.fn((items: unknown, page: unknown, config: unknown) => ({ type: 'listpage', items, page, config }))
const requireGuildMock = jest.fn()
const addMock = jest.fn()
const removeMock = jest.fn()
const listMock = jest.fn()

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createInfoEmbed: (...args: unknown[]) => createInfoEmbedMock(...args),
}))

jest.mock('../../../utils/general/responseEmbeds', () => ({
    buildListPageEmbed: (...args: unknown[]) => buildListPageEmbedMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    autoroleService: {
        add: (...args: unknown[]) => addMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
        list: (...args: unknown[]) => listMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

function createInteraction(subcommand: string, opts: Record<string, unknown> = {}) {
    return {
        guild: { id: 'guild-1' },
        options: {
            getSubcommand: () => subcommand,
            getRole: () => ({ id: 'role-1', toString: () => '<@&role-1>' }),
            getInteger: () => opts.delay ?? 0,
        },
        channel: { send: jest.fn() },
    }
}

describe('autorole command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
    })

    it('should be a valid command', () => {
        expect(autoroleCommand.data.name).toBe('autorole')
    })

    it('should add an autorole with no delay', async () => {
        addMock.mockResolvedValue({
            id: '1',
            guildId: 'guild-1',
            roleId: 'role-1',
            delayMinutes: 0,
            createdAt: new Date(),
        })

        await autoroleCommand.execute({
            interaction: createInteraction('add') as any,
        })

        expect(addMock).toHaveBeenCalledWith('guild-1', 'role-1', 0)
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('should add an autorole with delay', async () => {
        addMock.mockResolvedValue({
            id: '1',
            guildId: 'guild-1',
            roleId: 'role-1',
            delayMinutes: 30,
            createdAt: new Date(),
        })

        const interaction = createInteraction('add', { delay: 30 })
        interaction.options.getInteger = () => 30

        await autoroleCommand.execute({
            interaction: interaction as any,
        })

        expect(addMock).toHaveBeenCalledWith('guild-1', 'role-1', 30)
    })

    it('should remove an autorole', async () => {
        removeMock.mockResolvedValue(undefined)

        await autoroleCommand.execute({
            interaction: createInteraction('remove') as any,
        })

        expect(removeMock).toHaveBeenCalledWith('guild-1', 'role-1')
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    it('should list autoroles', async () => {
        listMock.mockResolvedValue([
            {
                id: '1',
                guildId: 'guild-1',
                roleId: 'role-1',
                delayMinutes: 0,
                createdAt: new Date(),
            },
        ])

        await autoroleCommand.execute({
            interaction: createInteraction('list') as any,
        })

        expect(listMock).toHaveBeenCalledWith('guild-1')
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
