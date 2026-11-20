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

const handleSetExclusive = jest.fn()
const handleRemoveExclusive = jest.fn()
const handleListExclusive = jest.fn()

jest.mock('../handlers/roleconfigHandlers.js', () => ({
    handleSetExclusive,
    handleRemoveExclusive,
    handleListExclusive,
}))

import roleConfigCommand from './roleconfig.js'
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
            getRole: (name: string) => opts[name] ?? null,
        },
    }
}

beforeEach(() => {
    interactionReply.mockClear().mockResolvedValue(undefined)
    handleSetExclusive.mockClear().mockResolvedValue(undefined)
    handleRemoveExclusive.mockClear().mockResolvedValue(undefined)
    handleListExclusive.mockClear().mockResolvedValue(undefined)
})

describe('/roleconfig', () => {
    test('requires guild context', async () => {
        const { requireGuild } = jest.requireMock(
            '../../../utils/command/commandValidations.js',
        ) as {
            requireGuild: jest.Mock
        }
        requireGuild.mockResolvedValueOnce(false)

        const interaction = createMockInteraction(
            makeInteraction('set-exclusive', {}, false),
        )

        await roleConfigCommand.execute({
            client: createMockClient({}),
            interaction,
        })

        expect(requireGuild).toHaveBeenCalled()
    })

    describe('set-exclusive subcommand', () => {
        test('delegates to handleSetExclusive', async () => {
            const role = { id: 'role-1' }
            const excludedRole = { id: 'role-2' }
            const interaction = createMockInteraction(
                makeInteraction('set-exclusive', {
                    role,
                    excluded_role: excludedRole,
                }),
            )

            await roleConfigCommand.execute({
                client: createMockClient({}),
                interaction,
            })

            expect(handleSetExclusive).toHaveBeenCalledWith(interaction)
        })
    })

    describe('remove-exclusive subcommand', () => {
        test('delegates to handleRemoveExclusive', async () => {
            const role = { id: 'role-1' }
            const excludedRole = { id: 'role-2' }
            const interaction = createMockInteraction(
                makeInteraction('remove-exclusive', {
                    role,
                    excluded_role: excludedRole,
                }),
            )

            await roleConfigCommand.execute({
                client: createMockClient({}),
                interaction,
            })

            expect(handleRemoveExclusive).toHaveBeenCalledWith(interaction)
        })
    })

    describe('list subcommand', () => {
        test('delegates to handleListExclusive', async () => {
            const interaction = createMockInteraction(makeInteraction('list'))

            await roleConfigCommand.execute({
                client: createMockClient({}),
                interaction,
            })

            expect(handleListExclusive).toHaveBeenCalledWith(interaction)
        })
    })

    describe('error handling', () => {
        test('catches handler errors gracefully', async () => {
            const role = { id: 'role-1' }
            const excludedRole = { id: 'role-2' }
            handleSetExclusive.mockRejectedValueOnce(new Error('db error'))

            const interaction = createMockInteraction(
                makeInteraction('set-exclusive', {
                    role,
                    excluded_role: excludedRole,
                }),
            )

            await roleConfigCommand.execute({
                client: createMockClient({}),
                interaction,
            })

            const call = interactionReply.mock.calls[0][0] as {
                content: { embeds?: Array<{ title: string }> }
            }
            expect(call.content.embeds?.[0]?.title).toContain('Error')
        })
    })
})
