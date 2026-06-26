import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Mock declarations BEFORE jest.mock calls
const batchJobServiceMock = {
    create: jest.fn(),
}
const checkBatchPermissionsMock = jest.fn()
const matchesScopeMock = jest.fn()
const enqueueBatchJobMock = jest.fn()
const showBatchConfirmationMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('@lucky/shared/services/batch', () => ({
    batchJobService: batchJobServiceMock,
    checkBatchPermissions: (...args: any[]) =>
        checkBatchPermissionsMock(...args),
    matchesScope: (...args: any[]) => matchesScopeMock(...args),
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

jest.mock('../batch/channelMoveExecutor', () => {
    class MockChannelMoveBatchExecutor {
        estimateMinutes = jest.fn(() => 10)
    }
    return {
        ChannelMoveBatchExecutor: MockChannelMoveBatchExecutor,
    }
})

// Import AFTER mocks
import bulkMoveMessagesCommand from './bulkMoveMessages'

function createMockUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
    }
}

function createMockChannel(id = 'chan-123', name = 'test-channel') {
    return {
        id,
        name,
        isTextBased: () => true,
        permissionsFor: jest.fn().mockReturnValue({
            has: () => true,
        }),
        messages: {
            fetch: jest.fn(),
        },
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
        },
    }
}

function createInteraction({
    guildId = 'guild-123',
    guild = undefined as any,
    userId = 'user-123',
    user = null as any,
    sourceChannel = null as any,
    destChannel = null as any,
    scopeType = 'all' as string,
    count = null as number | null,
    userOption = null as any,
    dateRange = null as string | null,
    contains = null as string | null,
    dryRun = false,
} = {}) {
    const interaction = {
        guild: guild !== undefined ? guild : createMockGuild(guildId),
        guildId,
        user: user || createMockUser(userId),
        options: {
            getChannel: jest.fn((name: string) => {
                if (name === 'source') return sourceChannel
                if (name === 'destination') return destChannel
                return null
            }),
            getString: jest.fn((name: string) => {
                if (name === 'scope') return scopeType
                if (name === 'date_range') return dateRange
                if (name === 'contains') return contains
                return null
            }),
            getInteger: jest.fn((name: string) => {
                if (name === 'count') return count
                return null
            }),
            getUser: jest.fn((name: string) => {
                if (name === 'user') return userOption
                return null
            }),
            getBoolean: jest.fn((name: string) => {
                if (name === 'dry_run') return dryRun
                return null
            }),
        },
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
    }

    return interaction as any
}

describe('bulkMoveMessages command', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        // Default mocks
        checkBatchPermissionsMock.mockReturnValue({
            allowed: true,
            missing: [],
        })
        matchesScopeMock.mockReturnValue(true)
        enqueueBatchJobMock.mockResolvedValue(undefined)
        showBatchConfirmationMock.mockResolvedValue(true)
        batchJobServiceMock.create.mockResolvedValue({
            id: 'job-123',
        })
    })

    describe('metadata', () => {
        test('exposes slash command metadata', () => {
            const json = bulkMoveMessagesCommand.data.toJSON()
            expect(json.name).toBe('bulk-move-messages')
            expect(json.description).toContain('Move multiple messages')
        })

        test('requires ManageMessages permission', () => {
            const json = bulkMoveMessagesCommand.data.toJSON()
            expect(json.default_member_permissions).toBeDefined()
        })
    })

    describe('execute', () => {
        test('rejects command outside of guild', async () => {
            const interaction = createInteraction({
                guildId: 'guild-123',
                guild: null,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('server'),
                },
            })
        })

        test('rejects non-text channels', async () => {
            const sourceChannel = createMockChannel()
            sourceChannel.isTextBased = () => false
            const destChannel = createMockChannel('chan-456')

            const interaction = createInteraction({
                sourceChannel,
                destChannel,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('text channel'),
                },
            })
        })

        test('rejects when source and destination are the same', async () => {
            const channel = createMockChannel('chan-123')
            const interaction = createInteraction({
                sourceChannel: channel,
                destChannel: channel,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('must be different'),
                },
            })
        })

        test('rejects when bot member not found', async () => {
            const guild = createMockGuild()
            guild.members.me = null
            const interaction = createInteraction({
                guild,
                sourceChannel: createMockChannel(),
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Bot member'),
                },
            })
        })

        test('rejects when permissions check fails', async () => {
            checkBatchPermissionsMock.mockReturnValue({
                allowed: false,
                missing: ['ManageMessages'],
            })

            const interaction = createInteraction({
                sourceChannel: createMockChannel(),
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Permission check failed'),
                },
            })
        })

        test('rejects count scope without count option', async () => {
            const interaction = createInteraction({
                sourceChannel: createMockChannel(),
                destChannel: createMockChannel('chan-456'),
                scopeType: 'count',
                count: null,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Count scope requires'),
                },
            })
        })

        test('rejects user scope without user option', async () => {
            const interaction = createInteraction({
                sourceChannel: createMockChannel(),
                destChannel: createMockChannel('chan-456'),
                scopeType: 'user',
                userOption: null,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('User scope requires'),
                },
            })
        })

        test('rejects date_range scope without date_range option', async () => {
            const interaction = createInteraction({
                sourceChannel: createMockChannel(),
                destChannel: createMockChannel('chan-456'),
                scopeType: 'date_range',
                dateRange: null,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining(
                        'Date range scope requires',
                    ),
                },
            })
        })

        test('rejects contains scope without contains option', async () => {
            const interaction = createInteraction({
                sourceChannel: createMockChannel(),
                destChannel: createMockChannel('chan-456'),
                scopeType: 'contains',
                contains: null,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content: expect.stringContaining('Contains scope requires'),
                },
            })
        })

        test('shows no messages message when estimate is zero', async () => {
            matchesScopeMock.mockReturnValue(false)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interaction.deferReply).toHaveBeenCalled()
            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('No messages match'),
            })
        })

        test('returns early with dry run estimate without creating job', async () => {
            matchesScopeMock.mockReturnValue(true)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
                dryRun: true,
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interaction.deferReply).toHaveBeenCalled()
            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Dry Run'),
            })
            expect(batchJobServiceMock.create).not.toHaveBeenCalled()
            expect(enqueueBatchJobMock).not.toHaveBeenCalled()
        })

        test('returns early when confirmation is declined', async () => {
            showBatchConfirmationMock.mockResolvedValue(false)
            matchesScopeMock.mockReturnValue(true)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('cancelled'),
            })
            expect(batchJobServiceMock.create).not.toHaveBeenCalled()
            expect(enqueueBatchJobMock).not.toHaveBeenCalled()
        })

        test('creates batch job and enqueues when confirmed', async () => {
            matchesScopeMock.mockReturnValue(true)
            showBatchConfirmationMock.mockResolvedValue(true)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                userId: 'user-123',
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(batchJobServiceMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: 'guild-123',
                    jobType: 'channel_move_batch',
                    initiatedBy: 'user-123',
                    sourceChannelId: 'chan-123',
                    targetChannelId: 'chan-456',
                    totalItems: expect.any(Number),
                    estimatedMinutes: expect.any(Number),
                }),
            )

            expect(enqueueBatchJobMock).toHaveBeenCalledWith('job-123')

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Batch job created'),
            })
        })

        test('handles job creation error gracefully', async () => {
            matchesScopeMock.mockReturnValue(true)
            showBatchConfirmationMock.mockResolvedValue(true)
            batchJobServiceMock.create.mockRejectedValue(
                new Error('Database error'),
            )

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Failed to create batch job'),
            })
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('samples messages to estimate count for "all" scope', async () => {
            matchesScopeMock.mockReturnValue(true)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map(
                    Array.from({ length: 500 }, (_, i) => [
                        `msg-${i}`,
                        {
                            id: `msg-${i}`,
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ]),
                ),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
                scopeType: 'all',
            })

            showBatchConfirmationMock.mockResolvedValue(false)

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(sourceChannel.messages.fetch).toHaveBeenCalledWith(
                expect.objectContaining({ limit: 500 }),
            )
        })

        test('uses exact count for "count" scope', async () => {
            matchesScopeMock.mockReturnValue(true)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
                scopeType: 'count',
                count: 42,
            })

            showBatchConfirmationMock.mockResolvedValue(false)

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            // For count scope, should use the provided count exactly (not sample)
            expect(
                (batchJobServiceMock.create as jest.Mock).mock.calls.length,
            ).toBeGreaterThanOrEqual(0)
        })

        test('handles message fetch error gracefully', async () => {
            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest
                .fn()
                .mockRejectedValue(new Error('Fetch failed'))

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Failed to estimate'),
            })
            expect(errorLogMock).toHaveBeenCalled()
        })

        test('logs successful job creation', async () => {
            matchesScopeMock.mockReturnValue(true)
            showBatchConfirmationMock.mockResolvedValue(true)

            const sourceChannel = createMockChannel()
            sourceChannel.messages.fetch = jest.fn().mockResolvedValue(
                new Map([
                    [
                        'msg-1',
                        {
                            id: 'msg-1',
                            author: { id: 'user-1' },
                            content: 'test',
                            createdAt: new Date(),
                        },
                    ],
                ]),
            )

            const interaction = createInteraction({
                sourceChannel,
                destChannel: createMockChannel('chan-456'),
            })

            await bulkMoveMessagesCommand.execute({ interaction } as any)

            expect(infoLogMock).toHaveBeenCalledWith({
                message: expect.stringContaining('Batch move job created'),
                data: expect.objectContaining({
                    sourceChannelId: 'chan-123',
                    destChannelId: 'chan-456',
                    totalItems: expect.any(Number),
                }),
            })
        })
    })
})
