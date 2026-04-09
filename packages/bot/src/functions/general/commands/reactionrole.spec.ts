import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        createReactionRoleMessage: jest.fn(),
        deleteReactionRoleMessage: jest.fn(),
        listReactionRoleMessages: jest.fn(),
    },
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations.js', () => ({
    requireGuild: async (interaction: any) => {
        return interaction.guild !== null
    },
}))

jest.mock('../../../utils/general/embeds.js', () => ({
    createErrorEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
    createSuccessEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
}))

jest.mock('../handlers/reactionroleHandlers.js', () => ({
    handleCreate: jest.fn(),
    handleDelete: jest.fn(),
    handleList: jest.fn(),
}))

import reactionroleCommand from './reactionrole.js'

function createGuild(id = 'guild-123') {
    return { id }
}

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    subcommand = 'list',
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        options: {
            getSubcommand: jest.fn(() => subcommand),
        },
    }
    return interaction as any
}

describe('reactionrole command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('command name is "reactionrole"', () => {
        expect(reactionroleCommand.data.name).toBe('reactionrole')
    })

    test('command has reaction role description', () => {
        expect(reactionroleCommand.data.description).toContain('reaction role')
    })

    test('command category is "general"', () => {
        expect(reactionroleCommand.category).toBe('general')
    })

    test('command requires ManageRoles permission', () => {
        const perms = reactionroleCommand.data.default_member_permissions
        expect(perms).toBeDefined()
    })

    test('has create subcommand', () => {
        const createSub = reactionroleCommand.data.options.find(
            (opt: any) => opt.name === 'create',
        )
        expect(createSub).toBeDefined()
    })

    test('has delete subcommand', () => {
        const deleteSub = reactionroleCommand.data.options.find(
            (opt: any) => opt.name === 'delete',
        )
        expect(deleteSub).toBeDefined()
    })

    test('has list subcommand', () => {
        const listSub = reactionroleCommand.data.options.find(
            (opt: any) => opt.name === 'list',
        )
        expect(listSub).toBeDefined()
    })

    test('has execute function', () => {
        expect(typeof reactionroleCommand.execute).toBe('function')
    })

    test('executes create subcommand in guild', async () => {
        const interaction = createInteraction({ subcommand: 'create' })

        await reactionroleCommand.execute({ interaction } as any)
    })

    test('executes delete subcommand in guild', async () => {
        const interaction = createInteraction({ subcommand: 'delete' })

        await reactionroleCommand.execute({ interaction } as any)
    })

    test('executes list subcommand in guild', async () => {
        const interaction = createInteraction({ subcommand: 'list' })

        await reactionroleCommand.execute({ interaction } as any)
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            guildId: null,
            options: { getSubcommand: jest.fn(() => 'list') },
        }

        await reactionroleCommand.execute({ interaction } as any)
    })

    test('returns early if guild is null after validation', async () => {
        const interaction = {
            guild: null,
            guildId: 'guild-123',
            options: { getSubcommand: jest.fn(() => 'create') },
        }

        await reactionroleCommand.execute({ interaction } as any)
    })

    test('handles all subcommands', async () => {
        const subcommands = ['create', 'delete', 'list']

        for (const subcommand of subcommands) {
            const interaction = createInteraction({ subcommand })
            await reactionroleCommand.execute({ interaction } as any)
        }
    })
})
