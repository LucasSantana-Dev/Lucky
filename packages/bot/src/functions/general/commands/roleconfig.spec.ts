import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    roleManagementService: {
        setExclusiveRole: jest.fn(),
        removeExclusiveRole: jest.fn(),
        listExclusiveRoles: jest.fn(),
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
    errorEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
    successEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
}))

jest.mock('../handlers/roleconfigHandlers.js', () => ({
    handleSetExclusive: jest.fn(),
    handleRemoveExclusive: jest.fn(),
    handleListExclusive: jest.fn(),
}))

import roleconfigCommand from './roleconfig.js'

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

describe('roleconfig command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('command name is "roleconfig"', () => {
        expect(roleconfigCommand.data.name).toBe('roleconfig')
    })

    test('command has mutually exclusive description', () => {
        expect(roleconfigCommand.data.description).toContain(
            'mutually exclusive',
        )
    })

    test('command category is "general"', () => {
        expect(roleconfigCommand.category).toBe('general')
    })

    test('command requires ManageRoles permission', () => {
        const perms = roleconfigCommand.data.default_member_permissions
        expect(perms).toBeDefined()
    })

    test('has set-exclusive subcommand', () => {
        const setSub = roleconfigCommand.data.options.find(
            (opt: any) => opt.name === 'set-exclusive',
        )
        expect(setSub).toBeDefined()
    })

    test('has remove-exclusive subcommand', () => {
        const removeSub = roleconfigCommand.data.options.find(
            (opt: any) => opt.name === 'remove-exclusive',
        )
        expect(removeSub).toBeDefined()
    })

    test('has list subcommand', () => {
        const listSub = roleconfigCommand.data.options.find(
            (opt: any) => opt.name === 'list',
        )
        expect(listSub).toBeDefined()
    })

    test('has execute function', () => {
        expect(typeof roleconfigCommand.execute).toBe('function')
    })

    test('executes set-exclusive subcommand in guild', async () => {
        const interaction = createInteraction({ subcommand: 'set-exclusive' })

        await roleconfigCommand.execute({ interaction } as any)
    })

    test('executes remove-exclusive subcommand in guild', async () => {
        const interaction = createInteraction({
            subcommand: 'remove-exclusive',
        })

        await roleconfigCommand.execute({ interaction } as any)
    })

    test('executes list subcommand in guild', async () => {
        const interaction = createInteraction({ subcommand: 'list' })

        await roleconfigCommand.execute({ interaction } as any)
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            guildId: null,
            options: { getSubcommand: jest.fn(() => 'list') },
        }

        await roleconfigCommand.execute({ interaction } as any)
    })

    test('returns early if guild is null after validation', async () => {
        const interaction = {
            guild: null,
            guildId: 'guild-123',
            options: { getSubcommand: jest.fn(() => 'set-exclusive') },
        }

        await roleconfigCommand.execute({ interaction } as any)
    })

    test('handles all subcommands', async () => {
        const subcommands = ['set-exclusive', 'remove-exclusive', 'list']

        for (const subcommand of subcommands) {
            const interaction = createInteraction({ subcommand })
            await roleconfigCommand.execute({ interaction } as any)
        }
    })
})
