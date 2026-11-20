jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations.js', () => ({
    requireGuild: jest.fn().mockResolvedValue(true),
}))

const interactionReply = jest.fn() as jest.MockedFunction<
    (args: { interaction: unknown; content: unknown }) => Promise<void>
>
jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply,
}))

jest.mock('../../../utils/general/embeds.js', () => ({
    createErrorEmbed: (title: string, desc: string) => ({
        title,
        description: desc,
    }),
}))

const handleCreate = jest.fn()
const handleDelete = jest.fn()
const handleList = jest.fn()

jest.mock('../handlers/reactionroleHandlers.js', () => ({
    handleCreate,
    handleDelete,
    handleList,
}))

import reactionroleCommand from './reactionrole.js'
import {
    createMockClient,
    createMockInteraction,
} from '../../../../tests/utils/command/fixtures.js'

function makeInteraction(
    subcommand: string,
    opts: Record<string, unknown> = {},
    withGuild = true,
) {
    return {
        guild: withGuild ? { id: 'guild-1', name: 'TestGuild' } : null,
        user: { id: 'u1', tag: 'alice#0000' },
        options: {
            getSubcommand: () => subcommand,
            getChannel: (name: string) => opts[name] ?? null,
            getString: (name: string) => opts[name] ?? null,
        },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    handleCreate.mockClear().mockResolvedValue(undefined)
    handleDelete.mockClear().mockResolvedValue(undefined)
    handleList.mockClear().mockResolvedValue(undefined)
})

describe('/reactionrole', () => {
    test('requires guild context', async () => {
        const { requireGuild } = jest.requireMock(
            '../../../utils/command/commandValidations.js',
        ) as {
            requireGuild: jest.Mock
        }
        requireGuild.mockResolvedValueOnce(false)

        const interaction = makeInteraction('create', {}, false)

        await reactionroleCommand.execute({
            client: createMockClient({}),
            interaction: createMockInteraction(interaction),
        })

        expect(requireGuild).toHaveBeenCalled()
    })

    describe('create subcommand', () => {
        test('delegates to handleCreate with interaction and guild', async () => {
            const channel = { id: 'chan-123' }
            const interaction = makeInteraction('create', {
                channel,
                title: 'Role Menu',
                description: 'Pick your roles',
                roles: 'role1:Label 1:emoji1:primary',
            })

            await reactionroleCommand.execute({
                client: createMockClient({}),
                interaction: createMockInteraction(interaction),
            })

            expect(handleCreate).toHaveBeenCalledWith(
                interaction,
                interaction.guild,
            )
        })
    })

    describe('delete subcommand', () => {
        test('delegates to handleDelete with interaction and guild', async () => {
            const interaction = makeInteraction('delete', {
                'message-id': 'msg-123',
            })

            await reactionroleCommand.execute({
                client: createMockClient({}),
                interaction: createMockInteraction(interaction),
            })

            expect(handleDelete).toHaveBeenCalledWith(
                interaction,
                interaction.guild,
            )
        })
    })

    describe('list subcommand', () => {
        test('delegates to handleList with interaction and guild', async () => {
            const interaction = makeInteraction('list')

            await reactionroleCommand.execute({
                client: createMockClient({}),
                interaction: createMockInteraction(interaction),
            })

            expect(handleList).toHaveBeenCalledWith(
                interaction,
                interaction.guild,
            )
        })
    })

    describe('error handling', () => {
        test('catches handler errors gracefully', async () => {
            const channel = { id: 'chan-123' }
            handleCreate.mockRejectedValueOnce(new Error('validation error'))

            const interaction = makeInteraction('create', {
                channel,
                title: 'Menu',
                description: 'Desc',
                roles: 'invalid',
            })

            await reactionroleCommand.execute({
                client: createMockClient({}),
                interaction: createMockInteraction(interaction),
            })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds?: Array<{ title: string }> }
            }
            expect(call.content.embeds?.[0]?.title).toContain('Error')
        })

        test('handles missing guild gracefully', async () => {
            const { requireGuild } = jest.requireMock(
                '../../../utils/command/commandValidations.js',
            ) as {
                requireGuild: jest.Mock
            }
            requireGuild.mockResolvedValueOnce(false)

            const interaction = makeInteraction('create', {}, false)

            await reactionroleCommand.execute({
                client: createMockClient({}),
                interaction: createMockInteraction(interaction),
            })

            expect(requireGuild).toHaveBeenCalled()
        })
    })
})
