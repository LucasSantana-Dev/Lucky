import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const requireGuildMock = jest.fn()
const interactionReplyMock = jest.fn()
const createSuccessEmbedMock = jest.fn(
    (title: string, desc?: string) => ({ title, description: desc }),
)
const createErrorEmbedMock = jest.fn(
    (title: string, desc?: string) => ({ title, description: desc }),
)
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

import ticketSetupCommand from './ticket-setup'

function createInteraction(sub: string, overrides: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        deferReply: jest.fn().mockResolvedValue(undefined),
        options: {
            getSubcommand: jest.fn().mockReturnValue(sub),
            getChannel: jest.fn().mockReturnValue({ id: 'cat-1', name: 'Support' }),
            getRole: jest.fn().mockReturnValue({ id: 'role-1', name: 'Agent' }),
        },
        ...overrides,
    } as any
}

describe('ticket-setup command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        setGuildSettingsMock.mockResolvedValue(true)
        getGuildSettingsMock.mockResolvedValue(null)
    })

    it('has correct name and category', () => {
        expect(ticketSetupCommand.data.name).toBe('ticket-setup')
        expect(ticketSetupCommand.category).toBe('general')
    })

    it('returns early when requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)
        const interaction = createInteraction('set')
        await ticketSetupCommand.execute({ client: {}, interaction } as any)
        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    describe('set subcommand', () => {
        it('saves category and role and replies with success', async () => {
            const interaction = createInteraction('set')
            await ticketSetupCommand.execute({ client: {}, interaction } as any)
            expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
                supportCategoryId: 'cat-1',
                supportAgentRoleId: 'role-1',
            })
            expect(createSuccessEmbedMock).toHaveBeenCalledWith(
                'Ticket Setup',
                expect.stringContaining('cat-1'),
            )
        })

        it('replies with error when persist fails', async () => {
            setGuildSettingsMock.mockResolvedValue(false)
            const interaction = createInteraction('set')
            await ticketSetupCommand.execute({ client: {}, interaction } as any)
            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Error',
                expect.any(String),
            )
        })
    })

    describe('clear subcommand', () => {
        it('clears category and role with explicit null (not undefined omit)', async () => {
            const interaction = createInteraction('clear')
            await ticketSetupCommand.execute({ client: {}, interaction } as any)
            expect(setGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
                supportCategoryId: null,
                supportAgentRoleId: null,
            })
            expect(createSuccessEmbedMock).toHaveBeenCalledWith(
                'Ticket Setup Cleared',
                expect.any(String),
            )
        })

        it('replies with error when persist fails', async () => {
            setGuildSettingsMock.mockResolvedValue(false)
            const interaction = createInteraction('clear')
            await ticketSetupCommand.execute({ client: {}, interaction } as any)
            expect(createErrorEmbedMock).toHaveBeenCalledWith(
                'Error',
                expect.any(String),
            )
        })
    })

    describe('show subcommand', () => {
        it('shows configured category and role', async () => {
            getGuildSettingsMock.mockResolvedValue({
                supportCategoryId: 'cat-9',
                supportAgentRoleId: 'role-9',
            })
            const interaction = createInteraction('show')
            await ticketSetupCommand.execute({ client: {}, interaction } as any)
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('cat-9'),
                }),
            )
        })

        it('shows not-configured message when unset', async () => {
            getGuildSettingsMock.mockResolvedValue(null)
            const interaction = createInteraction('show')
            await ticketSetupCommand.execute({ client: {}, interaction } as any)
            expect(createEmbedMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: expect.stringContaining('not configured'),
                }),
            )
        })
    })
})
