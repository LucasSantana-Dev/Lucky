import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { Collection } from 'discord.js'

const batchJobServiceMock = {
    create: jest.fn(),
    markFailed: jest.fn(),
}
const checkBatchPermissionsMock = jest.fn()
const enqueueBatchJobMock = jest.fn()
const showBatchConfirmationMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('@lucky/shared/services/batch', () => ({
    batchJobService: batchJobServiceMock,
    checkBatchPermissions: (...args: any[]) =>
        checkBatchPermissionsMock(...args),
}))

jest.mock('../../../utils/batch/batchQueue', () => ({
    enqueueBatchJob: (...args: any[]) => enqueueBatchJobMock(...args),
}))

jest.mock('../../../utils/batch/confirmationGate', () => ({
    showBatchConfirmation: (...args: any[]) =>
        showBatchConfirmationMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: any[]) => infoLogMock(...args),
    errorLog: (...args: any[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: any[]) => interactionReplyMock(...args),
}))

jest.mock('../batch/bulkRemoveRoleExecutor', () => {
    class MockBulkRemoveRoleExecutor {
        estimateMinutes = jest.fn(() => 10)
    }
    return {
        BulkRemoveRoleExecutor: MockBulkRemoveRoleExecutor,
    }
})

// Import AFTER mocks
import bulkRemoveRoleCommand from './bulkRemoveRole'

function createMockUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
    }
}

function createMockRole(id = 'role-123', name = 'TestRole') {
    return {
        id,
        name,
        members: new Collection(),
        editable: true,
    }
}

function createMockMember() {
    return {
        permissions: {
            has: jest.fn(() => true),
        },
    }
}

function createMockGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        members: {
            me: createMockMember(),
            fetch: jest.fn().mockResolvedValue(undefined),
        },
    }
}

function createInteraction({
    guildId = 'guild-123',
    guild = undefined as any,
    userId = 'user-123',
    user = null as any,
    role = null as any,
    reason = null as string | null,
    dryRun = false,
} = {}) {
    const interaction = {
        guild: guild !== undefined ? guild : createMockGuild(guildId),
        guildId,
        user: user || createMockUser(userId),
        options: {
            getRole: jest.fn((name: string) => (name === 'role' ? role : null)),
            getString: jest.fn((name: string) =>
                name === 'reason' ? reason : null,
            ),
            getBoolean: jest.fn((name: string) =>
                name === 'dry_run' ? dryRun : null,
            ),
        },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
    }

    return interaction as any
}

describe('bulkRemoveRole command', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        checkBatchPermissionsMock.mockReturnValue({
            allowed: true,
            missing: [],
        })
        enqueueBatchJobMock.mockResolvedValue(true)
        showBatchConfirmationMock.mockResolvedValue(true)
        batchJobServiceMock.create.mockResolvedValue({
            id: 'job-123',
        })
    })

    test('returns early if not in a guild', async () => {
        const interaction = createInteraction({ guild: null })
        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('must be run in a guild'),
                }),
            }),
        )
    })

    test('returns early when permission check fails', async () => {
        checkBatchPermissionsMock.mockReturnValue({
            allowed: false,
            missing: ['ManageRoles'],
        })
        const interaction = createInteraction({
            role: createMockRole(),
        })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Permission check failed'),
                }),
            }),
        )
    })

    test('returns early when no members hold the target role', async () => {
        const interaction = createInteraction({
            role: createMockRole('role-123', 'empty-role'),
        })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('No non-bot members'),
            }),
        )
    })

    test('reports count on dry-run without queueing', async () => {
        const role = createMockRole()
        role.members.set('u1', { user: { bot: false } } as any)
        role.members.set('u2', { user: { bot: false } } as any)
        const interaction = createInteraction({
            role,
            dryRun: true,
        })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Dry Run'),
            }),
        )
        expect(batchJobServiceMock.create).not.toHaveBeenCalled()
    })

    test('cancels operation when user rejects confirmation', async () => {
        showBatchConfirmationMock.mockResolvedValue(false)
        const role = createMockRole()
        role.members.set('u1', { user: { bot: false } } as any)
        const interaction = createInteraction({ role })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('cancelled'),
            }),
        )
        expect(batchJobServiceMock.create).not.toHaveBeenCalled()
    })

    test('returns failure reply when enqueueBatchJob returns null (Redis unavailable)', async () => {
        enqueueBatchJobMock.mockResolvedValue(null)
        const role = createMockRole()
        role.members.set('u1', { user: { bot: false } } as any)
        const interaction = createInteraction({ role })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining(
                    'Failed to queue bulk role removal job',
                ),
            }),
        )
        expect(batchJobServiceMock.create).toHaveBeenCalled()
        expect(infoLogMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Bulk role removal job created',
                ),
            }),
        )
    })

    test('queues bulk role removal job successfully when all permissions ok and enqueue succeeds', async () => {
        const role = createMockRole('role-456')
        role.members.set('u1', { user: { bot: false } } as any)
        role.members.set('u2', { user: { bot: false } } as any)
        const interaction = createInteraction({
            role,
            reason: 'cleanup',
        })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(batchJobServiceMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                jobType: 'bulk_remove_role',
                totalItems: 2,
                options: expect.objectContaining({
                    roleId: 'role-456',
                    reason: 'cleanup',
                }),
            }),
        )

        expect(enqueueBatchJobMock).toHaveBeenCalledWith('job-123')

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Bulk role removal queued'),
            }),
        )

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Bulk role removal job created',
                ),
            }),
        )
    })

    test('handles exception during job creation', async () => {
        batchJobServiceMock.create.mockRejectedValue(new Error('DB error'))
        const role = createMockRole()
        role.members.set('u1', { user: { bot: false } } as any)
        const interaction = createInteraction({ role })

        await bulkRemoveRoleCommand.execute({ interaction })

        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Failed to create batch job'),
            }),
        )
        expect(errorLogMock).toHaveBeenCalled()
    })
})
