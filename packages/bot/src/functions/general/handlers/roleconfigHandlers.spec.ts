import { describe, test, expect, jest, beforeEach } from '@jest/globals'

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

jest.mock('../../../utils/general/embeds.js', () => ({
    errorEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
    successEmbed: (title: string, desc: string) => ({
        data: { title, description: desc },
    }),
}))

import {
    handleSetExclusive,
    handleRemoveExclusive,
    handleListExclusive,
} from './roleconfigHandlers.js'
import { interactionReply } from '../../../utils/general/interactionReply.js'
import { roleManagementService } from '@lucky/shared/services'

const interactionReplyMock = interactionReply as jest.MockedFunction<
    typeof interactionReply
>
const setExclusiveRoleMock =
    roleManagementService.setExclusiveRole as jest.MockedFunction<any>
const removeExclusiveRoleMock =
    roleManagementService.removeExclusiveRole as jest.MockedFunction<any>
const listExclusiveRolesMock =
    roleManagementService.listExclusiveRoles as jest.MockedFunction<any>

function createRole(id = 'role-123', name = 'TestRole') {
    return { id, name }
}

function createGuild(id = 'guild-123') {
    return { id }
}

function createInteraction({
    guildId = 'guild-123',
    role = null as any,
    excludedRole = null as any,
} = {}) {
    const interaction = {
        guild: createGuild(guildId),
        guildId,
        options: {
            getRole: jest.fn((name: string) => {
                if (name === 'role') return role
                if (name === 'excluded_role') return excludedRole
                return null
            }),
        },
    }
    return interaction as any
}

describe('roleconfigHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('handleSetExclusive', () => {
        test('sets exclusive role rule successfully', async () => {
            const role = createRole('role-1', 'Developer')
            const excludedRole = createRole('role-2', 'Moderator')
            const interaction = createInteraction({
                guildId: 'guild-123',
                role,
                excludedRole,
            })

            setExclusiveRoleMock.mockResolvedValueOnce(true)

            await handleSetExclusive(interaction)

            expect(setExclusiveRoleMock).toHaveBeenCalledWith(
                'guild-123',
                'role-1',
                'role-2',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Success',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('rejects when role excludes itself', async () => {
            const role = createRole('role-1', 'Developer')
            const interaction = createInteraction({
                role,
                excludedRole: role,
            })

            await handleSetExclusive(interaction)

            expect(setExclusiveRoleMock).not.toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('sends error when service returns false', async () => {
            const role = createRole('role-1', 'Developer')
            const excludedRole = createRole('role-2', 'Moderator')
            const interaction = createInteraction({
                role,
                excludedRole,
            })

            setExclusiveRoleMock.mockResolvedValueOnce(false)

            await handleSetExclusive(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('uses correct guild id from interaction', async () => {
            const role = createRole('role-x', 'Role X')
            const excludedRole = createRole('role-y', 'Role Y')
            const interaction = createInteraction({
                guildId: 'guild-xyz',
                role,
                excludedRole,
            })

            setExclusiveRoleMock.mockResolvedValueOnce(true)

            await handleSetExclusive(interaction)

            expect(setExclusiveRoleMock).toHaveBeenCalledWith(
                'guild-xyz',
                'role-x',
                'role-y',
            )
        })
    })

    describe('handleRemoveExclusive', () => {
        test('removes exclusive role rule successfully', async () => {
            const role = createRole('role-1', 'Developer')
            const excludedRole = createRole('role-2', 'Moderator')
            const interaction = createInteraction({
                guildId: 'guild-123',
                role,
                excludedRole,
            })

            removeExclusiveRoleMock.mockResolvedValueOnce(true)

            await handleRemoveExclusive(interaction)

            expect(removeExclusiveRoleMock).toHaveBeenCalledWith(
                'guild-123',
                'role-1',
                'role-2',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Success',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('sends error when rule not found', async () => {
            const role = createRole('role-1', 'Developer')
            const excludedRole = createRole('role-2', 'Moderator')
            const interaction = createInteraction({
                role,
                excludedRole,
            })

            removeExclusiveRoleMock.mockResolvedValueOnce(false)

            await handleRemoveExclusive(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'Error',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('uses correct parameters for removal', async () => {
            const role = createRole('role-abc', 'RoleA')
            const excludedRole = createRole('role-def', 'RoleB')
            const interaction = createInteraction({
                guildId: 'guild-test',
                role,
                excludedRole,
            })

            removeExclusiveRoleMock.mockResolvedValueOnce(true)

            await handleRemoveExclusive(interaction)

            expect(removeExclusiveRoleMock).toHaveBeenCalledWith(
                'guild-test',
                'role-abc',
                'role-def',
            )
        })
    })

    describe('handleListExclusive', () => {
        test('lists all exclusive role rules', async () => {
            const interaction = createInteraction()

            listExclusiveRolesMock.mockResolvedValueOnce([
                { roleId: 'role-1', excludedRoleId: 'role-2' },
                { roleId: 'role-3', excludedRoleId: 'role-4' },
            ])

            await handleListExclusive(interaction)

            expect(listExclusiveRolesMock).toHaveBeenCalledWith('guild-123')
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        test('sends error when no rules found', async () => {
            const interaction = createInteraction()

            listExclusiveRolesMock.mockResolvedValueOnce([])

            await handleListExclusive(interaction)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: 'No Rules',
                            }),
                        }),
                    ],
                    ephemeral: true,
                },
            })
        })

        test('uses correct guild id for listing', async () => {
            const interaction = createInteraction({ guildId: 'guild-xyz' })

            listExclusiveRolesMock.mockResolvedValueOnce([])

            await handleListExclusive(interaction)

            expect(listExclusiveRolesMock).toHaveBeenCalledWith('guild-xyz')
        })

        test('marks reply as ephemeral when listing', async () => {
            const interaction = createInteraction()

            listExclusiveRolesMock.mockResolvedValueOnce([
                { roleId: 'role-1', excludedRoleId: 'role-2' },
            ])

            await handleListExclusive(interaction)

            const call = interactionReplyMock.mock.calls[0][0]
            expect(call.content.ephemeral).toBe(true)
        })

        test('displays multiple exclusions', async () => {
            const interaction = createInteraction()

            listExclusiveRolesMock.mockResolvedValueOnce([
                { roleId: 'role-1', excludedRoleId: 'role-2' },
                { roleId: 'role-3', excludedRoleId: 'role-4' },
                { roleId: 'role-5', excludedRoleId: 'role-6' },
            ])

            await handleListExclusive(interaction)

            const call = interactionReplyMock.mock.calls[0][0]
            const embed = call.content.embeds[0]
            expect(embed.data.description).toBeDefined()
        })
    })
})
