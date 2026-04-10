import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireGuildMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createErrorEmbedMock = jest.fn((title: string, desc?: string) => ({ title, description: desc }))
const createEmbedMock = jest.fn((opts: Record<string, unknown>) => opts)
const setGuildSettingsMock = jest.fn()
const getGuildSettingsMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createSuccessEmbed: (...args: unknown[]) => createSuccessEmbedMock(...args),
    createErrorEmbed: (...args: unknown[]) => createErrorEmbedMock(...args),
    createEmbed: (...args: unknown[]) => createEmbedMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        setGuildSettings: (...args: unknown[]) => setGuildSettingsMock(...args),
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
}))

import djroleCommand from './djrole'

function createInteraction(sub: string, overrides: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        options: {
            getSubcommand: jest.fn().mockReturnValue(sub),
            getRole: jest.fn().mockReturnValue({ id: 'role-1', name: 'DJ' }),
        },
        ...overrides,
    } as any
}

describe('djrole command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        setGuildSettingsMock.mockResolvedValue(true)
        getGuildSettingsMock.mockResolvedValue(null)
    })

    it('has correct name and category', () => {
        expect(djroleCommand.data.name).toBe('djrole')
        expect(djroleCommand.category).toBe('music')
    })

    it('returns early when requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const interaction = createInteraction('set')
        await djroleCommand.execute({ client: {}, interaction } as any)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    describe('set subcommand', () => {
        it('saves djRoleId and replies with success embed', async () => {
            const interaction = createInteraction('set')
            await djroleCommand.execute({ client: {}, interaction } as any)
            expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', { djRoleId: 'role-1' })
            expect(createSuccessEmbedMock).toHaveBeenCalledWith('🎧 DJ Role Set', expect.stringContaining('role-1'))
        })

        it('replies with error when persist fails', async () => {
            setGuildSettingsMock.mockResolvedValue(false)
            const interaction = createInteraction('set')
            await djroleCommand.execute({ client: {}, interaction } as any)
            expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.any(String))
        })
    })

    describe('clear subcommand', () => {
        it('clears djRoleId and replies with success embed', async () => {
            const interaction = createInteraction('clear')
            await djroleCommand.execute({ client: {}, interaction } as any)
            expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', { djRoleId: undefined })
            expect(createSuccessEmbedMock).toHaveBeenCalledWith('🎧 DJ Role Cleared', expect.any(String))
        })

        it('replies with error when persist fails', async () => {
            setGuildSettingsMock.mockResolvedValue(false)
            const interaction = createInteraction('clear')
            await djroleCommand.execute({ client: {}, interaction } as any)
            expect(createErrorEmbedMock).toHaveBeenCalledWith('Error', expect.any(String))
        })
    })

    describe('show subcommand', () => {
        it('shows configured DJ role when set', async () => {
            getGuildSettingsMock.mockResolvedValue({ djRoleId: 'role-99' })
            const interaction = createInteraction('show')
            await djroleCommand.execute({ client: {}, interaction } as any)
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({ description: expect.stringContaining('role-99') }),
            )
        })

        it('shows "no DJ role" when not configured', async () => {
            getGuildSettingsMock.mockResolvedValue(null)
            const interaction = createInteraction('show')
            await djroleCommand.execute({ client: {}, interaction } as any)
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({ description: expect.stringContaining('open to everyone') }),
            )
        })
    })
})
