import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { PermissionFlagsBits } from 'discord.js'

// Mock declarations BEFORE jest.mock calls
const batchJobServiceMock = {
    getById: jest.fn(),
    markInProgress: jest.fn(),
}
const enqueueBatchJobMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('@lucky/shared/services/batch', () => ({
    batchJobService: batchJobServiceMock,
}))

jest.mock('../../../utils/batch/batchQueue', () => ({
    enqueueBatchJob: (...args: any[]) => enqueueBatchJobMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: any[]) => errorLogMock(...args),
    infoLog: (...args: any[]) => infoLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: any[]) => interactionReplyMock(...args),
}))

// Import AFTER mocks
import batchResumeCommand from './batchResume'

function createMockJob(overrides: Record<string, unknown> = {}) {
    return {
        id: 'job-123',
        guildId: 'guild-123',
        initiatedBy: 'user-123',
        status: 'paused',
        ...overrides,
    }
}

function createInteraction({
    guildId = 'guild-123',
    guild = undefined as any,
    userId = 'user-456',
    user = null as any,
    jobId = 'job-123',
    memberPermissions = null as any,
    hasManageGuild = false,
} = {}) {
    const permissions = {
        has: jest.fn((perm) => {
            if (perm === PermissionFlagsBits.ManageGuild) return hasManageGuild
            return false
        }),
    }

    const interaction = {
        guild:
            guild !== undefined ? guild : { id: guildId, name: 'Test Guild' },
        guildId,
        user: user || { id: userId, tag: `User${userId}#1234` },
        memberPermissions: memberPermissions || permissions,
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'job_id') return jobId
                return null
            }),
        },
    }

    return interaction as any
}

describe('batchResume command', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        // Default mocks
        batchJobServiceMock.getById.mockResolvedValue(null)
        batchJobServiceMock.markInProgress.mockResolvedValue(undefined)
        enqueueBatchJobMock.mockResolvedValue(undefined)
    })

    describe('metadata', () => {
        test('exposes slash command metadata', () => {
            const json = batchResumeCommand.data.toJSON()
            expect(json.name).toBe('batch-resume')
            expect(json.description).toContain(
                'Resume a paused or failed batch job',
            )
        })

        test('requires ManageGuild permission', () => {
            const json = batchResumeCommand.data.toJSON()
            expect(json.default_member_permissions).toBeDefined()
        })

        test('has job_id as required string option', () => {
            const json = batchResumeCommand.data.toJSON()
            const jobIdOption = json.options.find(
                (opt: any) => opt.name === 'job_id',
            )
            expect(jobIdOption).toBeDefined()
            expect(jobIdOption.required).toBe(true)
        })
    })

    describe('execute', () => {
        test('rejects command outside of guild', async () => {
            const interaction = createInteraction({
                guild: null,
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('server'),
                },
            })
        })

        test('rejects when batch job not found', async () => {
            batchJobServiceMock.getById.mockResolvedValue(null)

            const interaction = createInteraction({
                jobId: 'nonexistent-job',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Batch job not found'),
                },
            })
        })

        test('rejects when job belongs to different guild', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-999',
                }),
            )

            const interaction = createInteraction({
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('different server'),
                },
            })
        })

        test('rejects non-initiator without ManageGuild permission', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-456', // Different user (not initiator)
                guildId: 'guild-123',
                jobId: 'job-123',
                hasManageGuild: false, // No ManageGuild permission
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Manage Server'),
                },
            })
        })

        test('allows initiator to resume their own job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123', // Initiator
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(batchJobServiceMock.markInProgress).toHaveBeenCalledWith(
                'job-123',
            )
            expect(enqueueBatchJobMock).toHaveBeenCalledWith('job-123')
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Resumed batch job'),
                },
            })
        })

        test('allows user with ManageGuild to resume any job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-456', // Different user
                guildId: 'guild-123',
                jobId: 'job-123',
                hasManageGuild: true, // Has ManageGuild permission
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(batchJobServiceMock.markInProgress).toHaveBeenCalledWith(
                'job-123',
            )
            expect(enqueueBatchJobMock).toHaveBeenCalledWith('job-123')
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Resumed batch job'),
                },
            })
        })

        test('rejects resume when job status is not paused or failed', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'completed',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('completed'),
                },
            })
            expect(batchJobServiceMock.markInProgress).not.toHaveBeenCalled()
            expect(enqueueBatchJobMock).not.toHaveBeenCalled()
        })

        test('allows resuming paused job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(batchJobServiceMock.markInProgress).toHaveBeenCalledWith(
                'job-123',
            )
            expect(enqueueBatchJobMock).toHaveBeenCalledWith('job-123')
        })

        test('allows resuming failed job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'failed',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(batchJobServiceMock.markInProgress).toHaveBeenCalledWith(
                'job-123',
            )
            expect(enqueueBatchJobMock).toHaveBeenCalledWith('job-123')
        })

        test('rejects resume for in_progress job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'in_progress',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('in_progress'),
                },
            })
            expect(batchJobServiceMock.markInProgress).not.toHaveBeenCalled()
        })

        test('rejects resume for pending job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'pending',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('pending'),
                },
            })
            expect(batchJobServiceMock.markInProgress).not.toHaveBeenCalled()
        })

        test('rejects resume for cancelled job', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'cancelled',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('cancelled'),
                },
            })
            expect(batchJobServiceMock.markInProgress).not.toHaveBeenCalled()
        })

        test('handles database error gracefully', async () => {
            batchJobServiceMock.getById.mockRejectedValue(
                new Error('Database error'),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Failed to resume'),
                },
            })
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('handles markInProgress error gracefully', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )
            batchJobServiceMock.markInProgress.mockRejectedValue(
                new Error('Mark error'),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Failed to resume'),
                },
            })
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('handles enqueueBatchJob error gracefully', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )
            batchJobServiceMock.markInProgress.mockResolvedValue(undefined)
            enqueueBatchJobMock.mockRejectedValue(new Error('Queue error'))

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Failed to resume'),
                },
            })
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('logs successful resume operation', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )
            batchJobServiceMock.markInProgress.mockResolvedValue(undefined)
            enqueueBatchJobMock.mockResolvedValue(undefined)

            const interaction = createInteraction({
                userId: 'user-456',
                guildId: 'guild-123',
                jobId: 'job-123',
                hasManageGuild: true,
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(infoLogMock).toHaveBeenCalledWith({
                message: expect.stringContaining('Resumed batch job'),
                data: expect.objectContaining({
                    guildId: 'guild-123',
                    resumedBy: 'user-456',
                }),
            })
        })

        test('returns correct job ID in success message', async () => {
            batchJobServiceMock.getById.mockResolvedValue(
                createMockJob({
                    id: 'job-abc-def-123',
                    guildId: 'guild-123',
                    initiatedBy: 'user-123',
                    status: 'paused',
                }),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                guildId: 'guild-123',
                jobId: 'job-abc-def-123',
            })

            await batchResumeCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('job-abc-def-123'),
                },
            })
        })
    })
})
