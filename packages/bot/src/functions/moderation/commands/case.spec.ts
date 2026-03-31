import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import caseCommand from './case.js'

const interactionReplyMock = jest.fn()
const errorLogMock = jest.fn()
const handleCaseViewMock = jest.fn()
const handleCaseUpdateMock = jest.fn()
const handleCaseDeleteMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../handlers/caseHandlers.js', () => ({
    handleCaseView: (...args: unknown[]) => handleCaseViewMock(...args),
    handleCaseUpdate: (...args: unknown[]) => handleCaseUpdateMock(...args),
    handleCaseDelete: (...args: unknown[]) => handleCaseDeleteMock(...args),
}))

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    subcommand = 'view' as string,
    caseNumber = 1 as number | null,
} = {}) {
    const interaction = {
        guild: guild || { id: guildId, name: 'Test Guild' },
        guildId,
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getInteger: jest.fn((name: string) => {
                if (name === 'case_number') return caseNumber
                return null
            }),
        },
    }

    return interaction as any
}

describe('case command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            options: {
                getSubcommand: jest.fn(),
                getInteger: jest.fn(),
            },
        } as any

        await caseCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    describe('view subcommand', () => {
        test('calls handleCaseView with correct case number', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 42,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseViewMock).toHaveBeenCalledWith(interaction, 42)
        })

        test('routes to view handler', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 5,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseViewMock).toHaveBeenCalled()
            expect(handleCaseUpdateMock).not.toHaveBeenCalled()
            expect(handleCaseDeleteMock).not.toHaveBeenCalled()
        })

        test('handles case number 1', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 1,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseViewMock).toHaveBeenCalledWith(interaction, 1)
        })

        test('handles large case numbers', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 999999,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseViewMock).toHaveBeenCalledWith(interaction, 999999)
        })
    })

    describe('update subcommand', () => {
        test('calls handleCaseUpdate with correct case number', async () => {
            const interaction = createInteraction({
                subcommand: 'update',
                caseNumber: 42,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseUpdateMock).toHaveBeenCalledWith(interaction, 42)
        })

        test('routes to update handler', async () => {
            const interaction = createInteraction({
                subcommand: 'update',
                caseNumber: 7,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseUpdateMock).toHaveBeenCalled()
            expect(handleCaseViewMock).not.toHaveBeenCalled()
            expect(handleCaseDeleteMock).not.toHaveBeenCalled()
        })
    })

    describe('delete subcommand', () => {
        test('calls handleCaseDelete with correct case number', async () => {
            const interaction = createInteraction({
                subcommand: 'delete',
                caseNumber: 42,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseDeleteMock).toHaveBeenCalledWith(interaction, 42)
        })

        test('routes to delete handler', async () => {
            const interaction = createInteraction({
                subcommand: 'delete',
                caseNumber: 3,
            })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseDeleteMock).toHaveBeenCalled()
            expect(handleCaseViewMock).not.toHaveBeenCalled()
            expect(handleCaseUpdateMock).not.toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        test('logs error when view handler throws', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 1,
            })
            const testError = new Error('Database error')
            handleCaseViewMock.mockRejectedValue(testError)

            await caseCommand.execute({ interaction } as any)

            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Failed to view case',
                error: testError,
            })
        })

        test('logs error when update handler throws', async () => {
            const interaction = createInteraction({
                subcommand: 'update',
                caseNumber: 1,
            })
            const testError = new Error('Prisma error')
            handleCaseUpdateMock.mockRejectedValue(testError)

            await caseCommand.execute({ interaction } as any)

            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Failed to update case',
                error: testError,
            })
        })

        test('logs error when delete handler throws', async () => {
            const interaction = createInteraction({
                subcommand: 'delete',
                caseNumber: 1,
            })
            const testError = new Error('Permission denied')
            handleCaseDeleteMock.mockRejectedValue(testError)

            await caseCommand.execute({ interaction } as any)

            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Failed to delete case',
                error: testError,
            })
        })

        test('sends error reply when view fails', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 1,
            })
            handleCaseViewMock.mockRejectedValue(new Error('Failed'))

            await caseCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: '❌ Failed to view case. Please try again.',
                },
            })
        })

        test('sends error reply when update fails', async () => {
            const interaction = createInteraction({
                subcommand: 'update',
                caseNumber: 1,
            })
            handleCaseUpdateMock.mockRejectedValue(new Error('Failed'))

            await caseCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: '❌ Failed to update case. Please try again.',
                },
            })
        })

        test('sends error reply when delete fails', async () => {
            const interaction = createInteraction({
                subcommand: 'delete',
                caseNumber: 1,
            })
            handleCaseDeleteMock.mockRejectedValue(new Error('Failed'))

            await caseCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: '❌ Failed to delete case. Please try again.',
                },
            })
        })

        test('handles handler errors with correct error message for view', async () => {
            const interaction = createInteraction({ subcommand: 'view' })
            handleCaseViewMock.mockRejectedValue(new Error('test'))

            await caseCommand.execute({ interaction } as any)

            const errorCall = errorLogMock.mock.calls[0][0]
            expect(errorCall.message).toContain('view')
        })

        test('handles handler errors with correct error message for update', async () => {
            const interaction = createInteraction({ subcommand: 'update' })
            handleCaseUpdateMock.mockRejectedValue(new Error('test'))

            await caseCommand.execute({ interaction } as any)

            const errorCall = errorLogMock.mock.calls[0][0]
            expect(errorCall.message).toContain('update')
        })

        test('handles handler errors with correct error message for delete', async () => {
            const interaction = createInteraction({ subcommand: 'delete' })
            handleCaseDeleteMock.mockRejectedValue(new Error('test'))

            await caseCommand.execute({ interaction } as any)

            const errorCall = errorLogMock.mock.calls[0][0]
            expect(errorCall.message).toContain('delete')
        })
    })

    describe('subcommand routing', () => {
        test('extracts case number correctly', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 123,
            })

            await caseCommand.execute({ interaction } as any)

            expect(interaction.options.getInteger).toHaveBeenCalledWith(
                'case_number',
                true,
            )
        })

        test('extracts subcommand correctly', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 1,
            })

            await caseCommand.execute({ interaction } as any)

            expect(interaction.options.getSubcommand).toHaveBeenCalled()
        })

        test('ignores unrecognized subcommands gracefully', async () => {
            const interaction = createInteraction({ subcommand: 'unknown' })

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseViewMock).not.toHaveBeenCalled()
            expect(handleCaseUpdateMock).not.toHaveBeenCalled()
            expect(handleCaseDeleteMock).not.toHaveBeenCalled()
        })
    })

    describe('successful operations', () => {
        test('view handler completes successfully', async () => {
            const interaction = createInteraction({
                subcommand: 'view',
                caseNumber: 1,
            })
            handleCaseViewMock.mockResolvedValue(undefined)

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseViewMock).toHaveBeenCalled()
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        test('update handler completes successfully', async () => {
            const interaction = createInteraction({
                subcommand: 'update',
                caseNumber: 1,
            })
            handleCaseUpdateMock.mockResolvedValue(undefined)

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseUpdateMock).toHaveBeenCalled()
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        test('delete handler completes successfully', async () => {
            const interaction = createInteraction({
                subcommand: 'delete',
                caseNumber: 1,
            })
            handleCaseDeleteMock.mockResolvedValue(undefined)

            await caseCommand.execute({ interaction } as any)

            expect(handleCaseDeleteMock).toHaveBeenCalled()
            expect(errorLogMock).not.toHaveBeenCalled()
        })
    })
})
