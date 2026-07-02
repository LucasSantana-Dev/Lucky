import {
    describe,
    expect,
    it,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import { EmbedBuilder } from 'discord.js'

const mockIsEnabled = jest.fn() as any
const mockGetPrismaClient = jest.fn() as any

jest.mock('../../services/FeatureToggleService', () => ({
    featureToggleService: {
        isEnabled: mockIsEnabled,
    },
}))

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
}))

jest.mock('../../utils/general/log', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

import { ReactionRolesService } from './index'

describe('ReactionRolesService', () => {
    let service: ReactionRolesService
    let mockPrisma: any

    beforeEach(() => {
        jest.clearAllMocks()
        service = new ReactionRolesService()
        mockPrisma = {
            reactionRoleMessage: {
                create: jest.fn(),
                findUnique: jest.fn(),
                delete: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            reactionRoleMapping: {
                findFirst: jest.fn(),
                deleteMany: jest.fn(),
                count: (jest.fn() as any).mockResolvedValue(0),
                create: jest.fn(),
            },
            $transaction: jest.fn() as any,
        }
        mockGetPrismaClient.mockReturnValue(mockPrisma)
        mockIsEnabled.mockResolvedValue(true)
        ;(mockPrisma.$transaction as any).mockImplementation(
            async (fnOrArray: any) => {
                if (typeof fnOrArray === 'function') {
                    return await fnOrArray(mockPrisma)
                }
                // Handle array pattern: execute each operation
                const results = []
                for (const op of fnOrArray) {
                    // Each op is a Prisma operation (like deleteMany result)
                    results.push(op)
                }
                return results
            },
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('isEnabled', () => {
        it('checks if feature is enabled for a guild', async () => {
            mockIsEnabled.mockResolvedValueOnce(true)
            const result = await service.isEnabled('guild-123')
            expect(result).toBe(true)
            expect(mockIsEnabled).toHaveBeenCalledWith('REACTION_ROLES', {
                guildId: 'guild-123',
                userId: undefined,
            })
        })

        it('checks if feature is enabled for a user', async () => {
            mockIsEnabled.mockResolvedValueOnce(false)
            const result = await service.isEnabled(undefined, 'user-456')
            expect(result).toBe(false)
            expect(mockIsEnabled).toHaveBeenCalledWith('REACTION_ROLES', {
                guildId: undefined,
                userId: 'user-456',
            })
        })

        it('checks if feature is enabled for both guild and user', async () => {
            mockIsEnabled.mockResolvedValueOnce(true)
            await service.isEnabled('guild-123', 'user-456')
            expect(mockIsEnabled).toHaveBeenCalledWith('REACTION_ROLES', {
                guildId: 'guild-123',
                userId: 'user-456',
            })
        })
    })

    describe('createReactionRoleMessage (discord.js path)', () => {
        const mockGuild: any = { id: 'guild-123' }
        const mockChannel: any = { id: 'channel-456', send: jest.fn() }
        const baseOptions = {
            guild: mockGuild,
            channel: mockChannel,
            embed: new EmbedBuilder(),
        }

        it('throws when reaction roles are disabled', async () => {
            mockIsEnabled.mockResolvedValueOnce(false)
            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessage(options),
            ).rejects.toThrow('Reaction roles are disabled for this guild')
        })

        it('throws when roles array is empty', async () => {
            const options = { ...baseOptions, roles: [] }
            await expect(
                service.createReactionRoleMessage(options),
            ).rejects.toThrow('At least one role is required')
        })

        it('throws when more than 25 roles provided', async () => {
            const roles = Array.from({ length: 26 }, (_, i) => ({
                roleId: `role-${i}`,
                label: `Role ${i}`,
            }))
            const options = { ...baseOptions, roles }
            await expect(
                service.createReactionRoleMessage(options),
            ).rejects.toThrow('Maximum 25 roles per message')
        })

        it('successfully creates message with one role', async () => {
            const mockMessage: any = { id: 'msg-789' }
            mockChannel.send.mockResolvedValueOnce(mockMessage)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({
                messageId: 'msg-789',
            })

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            const result = await service.createReactionRoleMessage(options)

            expect(result).toEqual(mockMessage)
            expect(mockChannel.send).toHaveBeenCalled()
            expect(mockPrisma.reactionRoleMessage.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        messageId: 'msg-789',
                        channelId: 'channel-456',
                        guildId: 'guild-123',
                    }),
                }),
            )
        })

        it('creates buttons with emoji when provided', async () => {
            const mockMessage: any = { id: 'msg-789' }
            mockChannel.send.mockResolvedValueOnce(mockMessage)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [{ roleId: 'role-1', label: 'Role 1', emoji: '😀' }],
            }
            await service.createReactionRoleMessage(options)

            const callArgs = mockChannel.send.mock.calls[0][0]
            const button = callArgs.components[0].components[0]
            // discord.js internally converts unicode emoji to an object
            expect(button.data.emoji).toEqual(
                expect.objectContaining({
                    name: '😀',
                }),
            )
        })

        it('splits buttons into multiple rows when more than 5', async () => {
            const mockMessage: any = { id: 'msg-789' }
            mockChannel.send.mockResolvedValueOnce(mockMessage)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const roles = Array.from({ length: 12 }, (_, i) => ({
                roleId: `role-${i}`,
                label: `Role ${i}`,
            }))
            const options = { ...baseOptions, roles }

            await service.createReactionRoleMessage(options)

            const callArgs = mockChannel.send.mock.calls[0][0]
            const components = callArgs.components
            expect(components.length).toBeGreaterThanOrEqual(3)
            expect(components[0].components.length).toBe(5)
            expect(components[1].components.length).toBe(5)
            expect(components[2].components.length).toBe(2)
        })

        it('throws when channel.send fails', async () => {
            mockChannel.send.mockRejectedValueOnce(
                new Error('Channel is deleted'),
            )

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessage(options),
            ).rejects.toThrow('Channel is deleted')
        })

        it('deletes message and rejects when prisma.create fails after channel.send succeeds (orphan cleanup)', async () => {
            const mockMessage: any = { id: 'msg-orphan', delete: jest.fn() }
            mockMessage.delete.mockResolvedValueOnce(undefined)
            mockChannel.send.mockResolvedValueOnce(mockMessage)

            const dbError = new Error('DB constraint violation')
            mockPrisma.reactionRoleMessage.create.mockRejectedValueOnce(dbError)

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }

            await expect(
                service.createReactionRoleMessage(options),
            ).rejects.toThrow('DB constraint violation')

            expect(mockMessage.delete).toHaveBeenCalledTimes(1)
        })

        it('does not call message.delete on successful create', async () => {
            const mockMessage: any = { id: 'msg-789', delete: jest.fn() }
            mockChannel.send.mockResolvedValueOnce(mockMessage)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({
                messageId: 'msg-789',
            })

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await service.createReactionRoleMessage(options)

            expect(mockMessage.delete).not.toHaveBeenCalled()
        })

        it('succeeds with 25 roles exactly (max)', async () => {
            const mockMessage: any = { id: 'msg-789' }
            mockChannel.send.mockResolvedValueOnce(mockMessage)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const roles = Array.from({ length: 25 }, (_, i) => ({
                roleId: `role-${i}`,
                label: `Role ${i}`,
            }))
            const options = { ...baseOptions, roles }

            const result = await service.createReactionRoleMessage(options)
            expect(result).toEqual(mockMessage)
        })
    })

    describe('createReactionRoleMessageFromDashboard (REST path)', () => {
        const baseOptions = {
            guildId: '12345678901234567',
            channelId: '98765432109876543',
            title: 'Test Roles',
            description: 'Click to assign',
            botToken: 'token-abc',
        }

        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('throws "Invalid guildId" when guildId is not a snowflake', async () => {
            const options = {
                ...baseOptions,
                guildId: 'not-a-snowflake',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow(
                'Invalid guildId: expected a Discord snowflake ID',
            )
        })

        it('throws "Invalid guildId" when guildId has too few digits', async () => {
            const options = {
                ...baseOptions,
                guildId: '123456789012345',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow(
                'Invalid guildId: expected a Discord snowflake ID',
            )
        })

        it('throws "Invalid guildId" when guildId has too many digits', async () => {
            const options = {
                ...baseOptions,
                guildId: '123456789012345678901',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow(
                'Invalid guildId: expected a Discord snowflake ID',
            )
        })

        it('throws "Invalid guildId" when guildId contains non-digits', async () => {
            const options = {
                ...baseOptions,
                guildId: '1234567890123456a',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow(
                'Invalid guildId: expected a Discord snowflake ID',
            )
        })

        it('throws "Invalid channelId" when channelId is not a snowflake', async () => {
            const options = {
                ...baseOptions,
                channelId: 'not-a-snowflake',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow(
                'Invalid channelId: expected a Discord snowflake ID',
            )
        })

        it('throws "Invalid channelId" when channelId has too few digits', async () => {
            const options = {
                ...baseOptions,
                channelId: '123456789012345',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow(
                'Invalid channelId: expected a Discord snowflake ID',
            )
        })

        it('accepts valid 17-digit snowflakes', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-new' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const validGuildId = '12345678901234567'
            const validChannelId = '98765432109876543'
            const options = {
                ...baseOptions,
                guildId: validGuildId,
                channelId: validChannelId,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            const result =
                await service.createReactionRoleMessageFromDashboard(options)
            expect(result.messageId).toBe('msg-new')
        })

        it('accepts valid 20-digit snowflakes', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-new' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const validGuildId = '12345678901234567890'
            const validChannelId = '98765432109876543210'
            const options = {
                ...baseOptions,
                guildId: validGuildId,
                channelId: validChannelId,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            const result =
                await service.createReactionRoleMessageFromDashboard(options)
            expect(result.messageId).toBe('msg-new')
        })

        it('throws when feature is disabled', async () => {
            mockIsEnabled.mockResolvedValueOnce(false)
            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('Reaction roles are disabled for this guild')
        })

        it('throws when roles array is empty', async () => {
            const options = { ...baseOptions, roles: [] }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('At least one role is required')
        })

        it('throws when more than 25 roles provided', async () => {
            const roles = Array.from({ length: 26 }, (_, i) => ({
                roleId: `role-${i}`,
                label: `role-${i}`,
                style: 'Primary' as const,
            }))
            const options = { ...baseOptions, roles }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('Maximum 25 roles per message')
        })

        it('POSTs to Discord API with correct URL and headers', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(
                    'https://discord.com/api/v10/channels/98765432109876543/messages',
                ),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bot token-abc',
                        'Content-Type': 'application/json',
                    }),
                }),
            )
        })

        it('parses Discord API response and extracts messageId', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: 'msg-discord-id',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            const result =
                await service.createReactionRoleMessageFromDashboard(options)

            expect(result.messageId).toBe('msg-discord-id')
        })

        it('creates prisma record with correct data', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-new' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [
                    {
                        roleId: '11111111111111111',
                        label: 'Role One',
                        emoji: '1️⃣',
                    },
                    {
                        roleId: '22222222222222222',
                        label: 'Role Two',
                        style: 'Success' as const,
                    },
                ],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            expect(mockPrisma.reactionRoleMessage.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        messageId: 'msg-new',
                        channelId: '98765432109876543',
                        guildId: '12345678901234567',
                        mappings: expect.objectContaining({
                            create: expect.arrayContaining([
                                expect.objectContaining({
                                    roleId: '11111111111111111',
                                    label: 'Role One',
                                    emoji: '1️⃣',
                                }),
                                expect.objectContaining({
                                    roleId: '22222222222222222',
                                    label: 'Role Two',
                                    style: 'Success',
                                }),
                            ]),
                        }),
                    }),
                }),
            )
        })

        it('throws when Discord API returns non-ok status', async () => {
            const mockResponse: any = {
                ok: false,
                status: 401,
                text: (jest.fn() as any).mockResolvedValue('Unauthorized'),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('Discord API error 401')
        })

        it('handles Discord API response with no text gracefully', async () => {
            const mockResponse: any = {
                ok: false,
                status: 500,
                text: (jest.fn() as any).mockRejectedValue(
                    new Error('read error'),
                ),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('Discord API error 500:')
        })

        it('deletes Discord message on DB write failure (orphan cleanup)', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: 'msg-orphan',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)

            const dbError = new Error('DB connection lost')
            mockPrisma.reactionRoleMessage.create.mockRejectedValueOnce(dbError)

            const mockDeleteResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({}),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockDeleteResponse)

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('DB connection lost')

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(
                    'https://discord.com/api/v10/channels/98765432109876543/messages/msg-orphan',
                ),
                expect.objectContaining({
                    method: 'DELETE',
                }),
            )
        })

        it('continues even if orphan cleanup fetch fails', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: 'msg-orphan',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)

            const dbError = new Error('DB write failed')
            mockPrisma.reactionRoleMessage.create.mockRejectedValueOnce(dbError)
            ;(global as any).fetch.mockRejectedValueOnce(
                new Error('Delete failed'),
            )

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await expect(
                service.createReactionRoleMessageFromDashboard(options),
            ).rejects.toThrow('DB write failed')
        })

        it('handles custom emoji <a:name:id> format', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [
                    {
                        roleId: '11111111111111111',
                        label: 'Animated',
                        emoji: '<a:spin:123456>',
                    },
                    {
                        roleId: '22222222222222222',
                        label: 'Static',
                        emoji: '<:star:789012>',
                    },
                ],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            const callArgs = (global.fetch as any).mock.calls[0]
            const body = JSON.parse((callArgs[1] as any).body)
            const buttons = body.components[0].components

            expect(buttons[0].emoji).toEqual(
                expect.objectContaining({
                    id: '123456',
                    name: 'spin',
                    animated: true,
                }),
            )

            expect(buttons[1].emoji).toEqual(
                expect.objectContaining({
                    id: '789012',
                    name: 'star',
                }),
            )
        })

        it('handles unicode emoji without parsing', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [
                    {
                        roleId: '11111111111111111',
                        label: 'Heart',
                        emoji: '❤️',
                    },
                ],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            const callArgs = (global.fetch as any).mock.calls[0]
            const body = JSON.parse((callArgs[1] as any).body)
            const button = body.components[0].components[0]

            expect(button.emoji).toEqual({
                name: '❤️',
            })
        })

        it('splits buttons into multiple rows when more than 5', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const roles = Array.from({ length: 12 }, (_, i) => ({
                roleId: String(i + 1).padStart(17, '1'),
                label: `Role ${i}`,
            }))
            const options = { ...baseOptions, roles }

            await service.createReactionRoleMessageFromDashboard(options)

            const callArgs = (global.fetch as any).mock.calls[0]
            const body = JSON.parse((callArgs[1] as any).body)
            const components = body.components

            expect(components.length).toBeGreaterThanOrEqual(3)
            expect(components[0].components.length).toBe(5)
            expect(components[1].components.length).toBe(5)
            expect(components[2].components.length).toBe(2)
        })
    })

    describe('deleteReactionRoleMessage', () => {
        it('deletes message and returns true when found and guild matches', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: 'msg-123',
                guildId: 'guild-456',
            })
            mockPrisma.reactionRoleMessage.delete.mockResolvedValueOnce({})

            const result = await service.deleteReactionRoleMessage(
                'msg-123',
                'guild-456',
            )

            expect(result).toBe(true)
            expect(
                mockPrisma.reactionRoleMessage.findUnique,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { messageId: 'msg-123' },
                }),
            )
            expect(mockPrisma.reactionRoleMessage.delete).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { messageId: 'msg-123' },
                }),
            )
        })

        it('returns false when message not found', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce(
                null,
            )

            const result = await service.deleteReactionRoleMessage(
                'msg-123',
                'guild-456',
            )

            expect(result).toBe(false)
            expect(mockPrisma.reactionRoleMessage.delete).not.toHaveBeenCalled()
        })

        it('returns false when guild ID does not match', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: 'msg-123',
                guildId: 'guild-different',
            })

            const result = await service.deleteReactionRoleMessage(
                'msg-123',
                'guild-456',
            )

            expect(result).toBe(false)
            expect(mockPrisma.reactionRoleMessage.delete).not.toHaveBeenCalled()
        })

        it('rejects when prisma delete fails', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: 'msg-123',
                guildId: 'guild-456',
            })
            mockPrisma.reactionRoleMessage.delete.mockRejectedValueOnce(
                new Error('DB error'),
            )

            await expect(
                service.deleteReactionRoleMessage('msg-123', 'guild-456'),
            ).rejects.toThrow('DB error')
        })

        it('returns false when delete races to P2025 (already deleted)', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: 'msg-123',
                guildId: 'guild-456',
            })
            const p2025 = Object.assign(
                new Error('Record to delete does not exist'),
                {
                    code: 'P2025',
                },
            )
            mockPrisma.reactionRoleMessage.delete.mockRejectedValueOnce(p2025)

            await expect(
                service.deleteReactionRoleMessage('msg-123', 'guild-456'),
            ).resolves.toBe(false)
        })

        it('rejects when findUnique throws', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockRejectedValueOnce(
                new Error('DB connection lost'),
            )

            await expect(
                service.deleteReactionRoleMessage('msg-123', 'guild-456'),
            ).rejects.toThrow('DB connection lost')
        })
    })

    describe('listReactionRoleMessages', () => {
        it('returns list of reaction role messages for guild', async () => {
            const mockMessages = [
                { messageId: 'msg-1', guildId: 'guild-123' },
                { messageId: 'msg-2', guildId: 'guild-123' },
            ]
            mockPrisma.reactionRoleMessage.findMany.mockResolvedValueOnce(
                mockMessages,
            )

            const result = await service.listReactionRoleMessages('guild-123')

            expect(result).toEqual(mockMessages)
            expect(
                mockPrisma.reactionRoleMessage.findMany,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { guildId: 'guild-123' },
                    orderBy: { createdAt: 'desc' },
                }),
            )
        })

        it('returns empty array when no messages found', async () => {
            mockPrisma.reactionRoleMessage.findMany.mockResolvedValueOnce([])

            const result = await service.listReactionRoleMessages('guild-999')

            expect(result).toEqual([])
        })

        it('rejects when prisma throws (does not swallow errors)', async () => {
            mockPrisma.reactionRoleMessage.findMany.mockRejectedValueOnce(
                new Error('DB connection lost'),
            )

            await expect(
                service.listReactionRoleMessages('guild-123'),
            ).rejects.toThrow('DB connection lost')
        })

        it('includes mappings in result', async () => {
            const mockMessages = [
                {
                    messageId: 'msg-1',
                    guildId: 'guild-123',
                    mappings: [
                        { roleId: 'role-1', buttonId: 'reactionrole:role-1' },
                    ],
                },
            ]
            mockPrisma.reactionRoleMessage.findMany.mockResolvedValueOnce(
                mockMessages,
            )

            const result = await service.listReactionRoleMessages('guild-123')

            expect(result[0].mappings).toBeDefined()
            expect(
                mockPrisma.reactionRoleMessage.findMany,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    include: { mappings: true },
                }),
            )
        })
    })

    describe('handleButtonInteraction', () => {
        function createMockInteraction(): any {
            return {
                guild: { id: 'guild-123', roles: { fetch: jest.fn() } },
                member: {
                    roles: {
                        cache: {
                            has: jest.fn(),
                            add: jest.fn(),
                            remove: jest.fn(),
                        },
                    },
                },
                user: { id: 'user-456' },
                customId: 'reactionrole:role-1',
                message: { id: 'msg-789' },
                reply: jest.fn(),
            }
        }

        it('returns false when no guild', async () => {
            const interaction = createMockInteraction()
            interaction.guild = null
            const result = await service.handleButtonInteraction(interaction)
            expect(result).toBe(false)
        })

        it('returns false when no member', async () => {
            const interaction = createMockInteraction()
            interaction.member = null
            const result = await service.handleButtonInteraction(interaction)
            expect(result).toBe(false)
        })

        it('returns false when customId does not start with reactionrole:', async () => {
            const interaction = createMockInteraction()
            interaction.customId = 'other:role-1'
            const result = await service.handleButtonInteraction(interaction)
            expect(result).toBe(false)
        })

        it('replies and returns true when feature is disabled', async () => {
            mockIsEnabled.mockResolvedValueOnce(false)
            const interaction = createMockInteraction()

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('disabled'),
                    ephemeral: true,
                }),
            )
        })

        it('replies and returns true when mapping not found', async () => {
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce(null)
            const interaction = createMockInteraction()

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('no longer valid'),
                    ephemeral: true,
                }),
            )
        })

        it('replies and returns true when guild ID in mapping does not match', async () => {
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce({
                buttonId: 'reactionrole:role-1',
                message: { messageId: 'msg-789', guildId: 'guild-different' },
            })
            const interaction = createMockInteraction()

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('no longer valid'),
                }),
            )
        })

        it('replies and returns true when role no longer exists', async () => {
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce({
                buttonId: 'reactionrole:role-1',
                message: { messageId: 'msg-789', guildId: 'guild-123' },
            })
            const interaction = createMockInteraction()
            interaction.guild.roles.fetch.mockResolvedValueOnce(null)

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('no longer exists'),
                    ephemeral: true,
                }),
            )
        })

        it('removes role when member already has it', async () => {
            const mockRole: any = { name: 'Admin' }
            const interaction = createMockInteraction()
            const mockRemove = jest.fn()
            interaction.member.roles.remove = mockRemove
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce({
                buttonId: 'reactionrole:role-1',
                message: { messageId: 'msg-789', guildId: 'guild-123' },
            })
            interaction.guild.roles.fetch.mockResolvedValueOnce(mockRole)
            interaction.member.roles.cache.has.mockReturnValueOnce(true)

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(mockRemove).toHaveBeenCalledWith(mockRole)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Removed role Admin'),
                    ephemeral: true,
                }),
            )
        })

        it('adds role when member does not have it', async () => {
            const mockRole: any = { name: 'Member' }
            const interaction = createMockInteraction()
            const mockAdd = jest.fn()
            interaction.member.roles.add = mockAdd
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce({
                buttonId: 'reactionrole:role-1',
                message: { messageId: 'msg-789', guildId: 'guild-123' },
            })
            interaction.guild.roles.fetch.mockResolvedValueOnce(mockRole)
            interaction.member.roles.cache.has.mockReturnValueOnce(false)

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(mockAdd).toHaveBeenCalledWith(mockRole)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Added role Member'),
                    ephemeral: true,
                }),
            )
        })

        it('returns true and replies with error message on exception', async () => {
            mockPrisma.reactionRoleMapping.findFirst.mockRejectedValueOnce(
                new Error('DB error'),
            )

            const interaction = createMockInteraction()
            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
            expect(interaction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('error occurred'),
                    ephemeral: true,
                }),
            )
        })

        it('returns true even if reply throws on error', async () => {
            mockPrisma.reactionRoleMapping.findFirst.mockRejectedValueOnce(
                new Error('DB error'),
            )
            const interaction = createMockInteraction()
            interaction.reply.mockRejectedValueOnce(
                new Error('Already replied'),
            )

            const result = await service.handleButtonInteraction(interaction)

            expect(result).toBe(true)
        })

        it('queries mapping with correct buttonId and messageId', async () => {
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce({
                buttonId: 'reactionrole:role-1',
                message: { messageId: 'msg-789', guildId: 'guild-123' },
            })
            const mockRole: any = { name: 'Test' }
            const interaction = createMockInteraction()
            interaction.guild.roles.fetch.mockResolvedValueOnce(mockRole)
            interaction.member.roles.cache.has.mockReturnValueOnce(false)

            await service.handleButtonInteraction(interaction)

            expect(
                mockPrisma.reactionRoleMapping.findFirst,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        buttonId: 'reactionrole:role-1',
                    }),
                    include: { message: true },
                }),
            )
        })
    })

    describe('parseEmoji (private, tested via dashboard path)', () => {
        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('parses animated custom emoji format', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                guildId: '12345678901234567',
                channelId: '98765432109876543',
                title: 'Test',
                description: 'Test',
                botToken: 'token',
                roles: [
                    {
                        roleId: '11111111111111111',
                        label: 'L1',
                        emoji: '<a:fire:12345>',
                    },
                ],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            const body = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            const emoji = body.components[0].components[0].emoji

            expect(emoji.id).toBe('12345')
            expect(emoji.name).toBe('fire')
            expect(emoji.animated).toBe(true)
        })

        it('parses static custom emoji format', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                guildId: '12345678901234567',
                channelId: '98765432109876543',
                title: 'Test',
                description: 'Test',
                botToken: 'token',
                roles: [
                    {
                        roleId: '11111111111111111',
                        label: 'L1',
                        emoji: '<:star:98765>',
                    },
                ],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            const body = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            const emoji = body.components[0].components[0].emoji

            expect(emoji.id).toBe('98765')
            expect(emoji.name).toBe('star')
            expect(emoji.animated).toBe(false)
        })

        it('returns plain name for unicode emoji', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                guildId: '12345678901234567',
                channelId: '98765432109876543',
                title: 'Test',
                description: 'Test',
                botToken: 'token',
                roles: [
                    { roleId: '11111111111111111', label: 'L1', emoji: '✨' },
                ],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            const body = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            const emoji = body.components[0].components[0].emoji

            expect(emoji.name).toBe('✨')
            expect(emoji.id).toBeUndefined()
            expect(emoji.animated).toBeUndefined()
        })
    })

    describe('integration: full end-to-end scenarios', () => {
        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('discord.js flow: create → fetch → delete', async () => {
            const mockMessage: any = { id: 'msg-final' }
            const mockChannel: any = {
                id: 'ch-1',
                send: (jest.fn() as any).mockResolvedValue(mockMessage),
            }
            const mockGuild: any = { id: 'guild-1' }

            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: 'msg-final',
                guildId: 'guild-1',
            })
            mockPrisma.reactionRoleMessage.delete.mockResolvedValueOnce({})

            const created = await service.createReactionRoleMessage({
                guild: mockGuild,
                channel: mockChannel,
                embed: new EmbedBuilder(),
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            })

            expect(created).toEqual(mockMessage)

            const deleted = await service.deleteReactionRoleMessage(
                'msg-final',
                'guild-1',
            )
            expect(deleted).toBe(true)
        })

        it('dashboard flow: create with REST → list → delete', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-rest' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const created =
                await service.createReactionRoleMessageFromDashboard({
                    guildId: '12345678901234567',
                    channelId: '98765432109876543',
                    title: 'Test',
                    description: 'Test',
                    botToken: 'token',
                    roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
                })

            expect(created.messageId).toBe('msg-rest')

            mockPrisma.reactionRoleMessage.findMany.mockResolvedValueOnce([
                { messageId: 'msg-rest', guildId: '12345678901234567' },
            ])

            const listed =
                await service.listReactionRoleMessages('12345678901234567')
            expect(listed.length).toBeGreaterThan(0)

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: 'msg-rest',
                guildId: '12345678901234567',
            })
            mockPrisma.reactionRoleMessage.delete.mockResolvedValueOnce({})

            const deleted = await service.deleteReactionRoleMessage(
                'msg-rest',
                '12345678901234567',
            )
            expect(deleted).toBe(true)
        })
    })
    describe('updateReactionRoleMessage (REST edit path)', () => {
        const baseOptions = {
            guildId: '12345678901234567',
            messageId: '98765432109876543',
            title: 'Updated Title',
            description: 'Updated description',
            botToken: 'token-abc',
            roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
        }

        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
            mockPrisma.$transaction = jest.fn()
            mockPrisma.reactionRoleMapping = {
                deleteMany: jest.fn(),
            }
            mockPrisma.reactionRoleMessage = {
                update: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                delete: jest.fn(),
                findMany: jest.fn(),
            }
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('throws "Reaction role message not found" when message does not exist', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce(
                null,
            )

            await expect(
                service.updateReactionRoleMessage(baseOptions),
            ).rejects.toThrow('Reaction role message not found')
        })

        it('throws "Reaction role message not found" when guildId does not match stored message', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: 'different-guild',
                channelId: '12345',
            })

            await expect(
                service.updateReactionRoleMessage(baseOptions),
            ).rejects.toThrow('Reaction role message not found')
        })

        it('calls fetch with PATCH method to Discord API messages URL', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
                mappings: [],
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            await service.updateReactionRoleMessage(baseOptions)

            expect(global.fetch).toHaveBeenCalledWith(
                'https://discord.com/api/v10/channels/11111111111111111/messages/98765432109876543',
                expect.objectContaining({
                    method: 'PATCH',
                    headers: expect.objectContaining({
                        Authorization: 'Bot token-abc',
                    }),
                }),
            )
        })

        it('deletes old mappings by message cuid, not Discord snowflake (#1675)', async () => {
            // ReactionRoleMapping.messageId is a FK to ReactionRoleMessage.id
            // (a cuid). Using the Discord snowflake matched zero rows, so the
            // nested create collided on @@unique([messageId, roleId]) -> 400.
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'cuid-internal-1',
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
                mappings: [],
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            await service.updateReactionRoleMessage(baseOptions)

            expect(
                mockPrisma.reactionRoleMapping.deleteMany,
            ).toHaveBeenCalledWith({
                where: { messageId: 'cuid-internal-1' },
            })
        })

        it('rollback also deletes by cuid when the Discord update fails (#1675)', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'cuid-internal-2',
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
                title: 'old',
                description: 'old',
                imageUrl: null,
                mappings: [],
            })
            // First $transaction (the update) succeeds; the Discord PATCH then
            // fails, triggering the rollback $transaction.
            mockPrisma.$transaction.mockResolvedValueOnce({})
            mockPrisma.$transaction.mockResolvedValueOnce({})
            ;(global as any).fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: (jest.fn() as any).mockResolvedValue('err'),
            })

            await expect(
                service.updateReactionRoleMessage(baseOptions),
            ).rejects.toThrow('Discord API error 500')

            // Every deleteMany (update + rollback) must target the cuid, never
            // the Discord snowflake.
            for (const call of mockPrisma.reactionRoleMapping.deleteMany.mock
                .calls) {
                expect(call[0]).toEqual({
                    where: { messageId: 'cuid-internal-2' },
                })
            }
            expect(
                mockPrisma.reactionRoleMapping.deleteMany,
            ).toHaveBeenCalledTimes(2)
        })

        it('includes imageUrl in PATCH body embed when provided', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            const optionsWithImage = {
                ...baseOptions,
                imageUrl: 'https://example.com/image.png',
            }
            await service.updateReactionRoleMessage(optionsWithImage)

            const callBody = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            expect(callBody.embeds[0].image).toEqual({
                url: 'https://example.com/image.png',
            })
            // persists the embed content so the edit form can prefill it later
            expect(mockPrisma.reactionRoleMessage.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: optionsWithImage.title,
                        description: optionsWithImage.description,
                        imageUrl: 'https://example.com/image.png',
                    }),
                }),
            )
        })

        it('does not include image in PATCH body embed when imageUrl not provided', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            await service.updateReactionRoleMessage(baseOptions)

            const callBody = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            expect(callBody.embeds[0].image).toBeUndefined()
        })

        it('invokes $transaction with deleteMany and update', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            await service.updateReactionRoleMessage(baseOptions)

            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
            const txnArg = mockPrisma.$transaction.mock.calls[0][0]
            expect(txnArg).toBeInstanceOf(Array)
            expect(txnArg.length).toBeGreaterThanOrEqual(2)
        })

        it('throws when Discord API returns !ok', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })
            const mockResponse: any = {
                ok: false,
                status: 404,
                text: (jest.fn() as any).mockResolvedValue('Message not found'),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)

            await expect(
                service.updateReactionRoleMessage(baseOptions),
            ).rejects.toThrow(/Discord API error 404/)
        })

        it('returns { messageId } on success', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            const result = await service.updateReactionRoleMessage(baseOptions)

            expect(result).toEqual({ messageId: '98765432109876543' })
        })

        it('validates snowflake IDs before fetch (guildId check)', async () => {
            const optionsWithBadGuildId = {
                ...baseOptions,
                guildId: 'not-a-snowflake',
            }

            await expect(
                service.updateReactionRoleMessage(optionsWithBadGuildId),
            ).rejects.toThrow(/Invalid guildId/)
        })

        it('validates snowflake IDs before fetch (messageId check)', async () => {
            const optionsWithBadMessageId = {
                ...baseOptions,
                messageId: 'not-a-snowflake',
            }

            await expect(
                service.updateReactionRoleMessage(optionsWithBadMessageId),
            ).rejects.toThrow(/Invalid messageId/)
        })

        it('builds button rows and includes in PATCH body components', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            const multiRoleOptions = {
                ...baseOptions,
                roles: [
                    { roleId: '22222222222222222', label: 'Role 1' },
                    { roleId: '33333333333333333', label: 'Role 2' },
                ],
            }
            await service.updateReactionRoleMessage(multiRoleOptions)

            const callBody = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            expect(callBody.components).toBeDefined()
            expect(callBody.components.length).toBeGreaterThan(0)
            expect(callBody.components[0].components).toBeDefined()
            expect(callBody.components[0].components.length).toBeGreaterThan(0)
        })
    })

    describe('createReactionRoleMessageFromDashboard with imageUrl', () => {
        const baseOptions = {
            guildId: '12345678901234567',
            channelId: '98765432109876543',
            title: 'Test Roles',
            description: 'Click to assign',
            botToken: 'token-abc',
        }

        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('includes imageUrl in POST body embed when provided', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const optionsWithImage = {
                ...baseOptions,
                imageUrl: 'https://example.com/image.jpg',
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await service.createReactionRoleMessageFromDashboard(
                optionsWithImage,
            )

            const callBody = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            expect(callBody.embeds[0].image).toEqual({
                url: 'https://example.com/image.jpg',
            })
        })

        it('does not include image in POST body when imageUrl not provided', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const options = {
                ...baseOptions,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }
            await service.createReactionRoleMessageFromDashboard(options)

            const callBody = JSON.parse(
                ((global.fetch as any).mock.calls[0][1] as any).body,
            )
            expect(callBody.embeds[0].image).toBeUndefined()
        })
    })

    describe('createReactionRoleMessageFromDashboard with file upload', () => {
        const baseOptions = {
            guildId: '12345678901234567',
            channelId: '98765432109876543',
            title: 'Test Roles',
            description: 'Click to assign',
            botToken: 'token-abc',
        }

        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('sends multipart request with file when imageFile provided', async () => {
            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const imageFile = {
                buffer: Buffer.from('fake-image-data'),
                filename: 'test-image.png',
                contentType: 'image/png',
            }

            const optionsWithFile = {
                ...baseOptions,
                imageFile,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }

            await service.createReactionRoleMessageFromDashboard(
                optionsWithFile as any,
            )

            const fetchCall = (global.fetch as any).mock.calls[0]
            const headers = fetchCall[1].headers

            // Multipart request should NOT have Content-Type: application/json
            expect(headers['Content-Type']).toBeUndefined()

            // Body should be FormData, not a string
            const body = fetchCall[1].body
            expect(body).toBeInstanceOf(FormData)
        })

        it('includes attachment:// reference in embed image when file provided', async () => {
            const imageFile = {
                buffer: Buffer.from('fake-image-data'),
                filename: 'test-image.png',
                contentType: 'image/png',
            }

            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const optionsWithFile = {
                ...baseOptions,
                imageFile,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }

            await service.createReactionRoleMessageFromDashboard(
                optionsWithFile as any,
            )

            const fetchCall = (global.fetch as any).mock.calls[0]
            const body = fetchCall[1].body as FormData
            const entries = Array.from(body.entries())

            // Verify payload_json contains attachment:// reference
            const payloadEntry = entries.find((e) => e[0] === 'payload_json')
            expect(payloadEntry).toBeDefined()
            const payload = JSON.parse(payloadEntry![1] as string)
            expect(payload.embeds[0].image.url).toBe(
                'attachment://test-image.png',
            )

            // Verify files part exists (FormData converts it to File/Blob)
            const fileEntry = entries.find((e) => e[0] === 'files[0]')
            expect(fileEntry).toBeDefined()
            const uploadedFile = fileEntry![1] as any
            expect(uploadedFile.name).toBe('test-image.png')
            expect(uploadedFile.type).toBe('image/png')
        })

        it('stores null imageUrl when file is used (not an http URL)', async () => {
            const imageFile = {
                buffer: Buffer.from('fake-image-data'),
                filename: 'test-image.png',
                contentType: 'image/png',
            }

            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({ id: 'msg-123' }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({})

            const optionsWithFile = {
                ...baseOptions,
                imageFile,
                roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
            }

            await service.createReactionRoleMessageFromDashboard(
                optionsWithFile as any,
            )

            // Prisma create should be called with imageUrl: null (no URL to store)
            expect(mockPrisma.reactionRoleMessage.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        imageUrl: null,
                    }),
                }),
            )
        })
    })

    describe('updateReactionRoleMessage with file upload', () => {
        const baseOptions = {
            guildId: '12345678901234567',
            messageId: '98765432109876543',
            title: 'Updated Title',
            description: 'Updated description',
            botToken: 'token-abc',
            roles: [{ roleId: '11111111111111111', label: 'Role 1' }],
        }

        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
            mockPrisma.$transaction = jest.fn()
            mockPrisma.reactionRoleMapping = {
                deleteMany: jest.fn(),
            }
            mockPrisma.reactionRoleMessage = {
                update: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                delete: jest.fn(),
                findMany: jest.fn(),
            }
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('sends multipart request with file for PATCH when imageFile provided', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })

            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            const imageFile = {
                buffer: Buffer.from('updated-image-data'),
                filename: 'updated-image.jpg',
                contentType: 'image/jpeg',
            }

            const optionsWithFile = {
                ...baseOptions,
                imageFile,
            }

            await service.updateReactionRoleMessage(optionsWithFile as any)

            const fetchCall = (global.fetch as any).mock.calls[0]
            const method = fetchCall[1].method
            expect(method).toBe('PATCH')

            const body = fetchCall[1].body
            expect(body).toBeInstanceOf(FormData)
        })

        it('sets attachments: [] in PATCH body when replacing file', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                messageId: '98765432109876543',
                guildId: '12345678901234567',
                channelId: '11111111111111111',
            })

            const mockResponse: any = {
                ok: true,
                json: (jest.fn() as any).mockResolvedValue({
                    id: '98765432109876543',
                }),
            }
            ;(global as any).fetch.mockResolvedValueOnce(mockResponse)
            mockPrisma.$transaction.mockResolvedValueOnce({})

            const imageFile = {
                buffer: Buffer.from('updated-image-data'),
                filename: 'updated-image.jpg',
                contentType: 'image/jpeg',
            }

            const optionsWithFile = {
                ...baseOptions,
                imageFile,
            }

            await service.updateReactionRoleMessage(optionsWithFile as any)

            const fetchCall = (global.fetch as any).mock.calls[0]
            const body = fetchCall[1].body as FormData
            const entries = Array.from(body.entries())
            const payloadEntry = entries.find((e) => e[0] === 'payload_json')
            const payload = JSON.parse(payloadEntry![1] as string)
            expect(payload.attachments).toEqual([])
        })
    })

    describe('addRoleToMessage (DB-first append)', () => {
        const messageId = '98765432109876543'
        const guildId = '12345678901234567'
        const channelId = '11111111111111111'
        const newRoleId = '22222222222222222'
        const botToken = 'token-abc'

        beforeEach(() => {
            ;(global as any).fetch = jest.fn()
            mockPrisma.$transaction = jest.fn()
            mockPrisma.reactionRoleMessage = {
                findUnique: jest.fn(),
            }
            mockPrisma.reactionRoleMapping = {
                create: jest.fn(),
                deleteMany: jest.fn(),
                count: (jest.fn() as any).mockResolvedValue(0),
                findFirst: (jest.fn() as any).mockResolvedValue(null),
            }
        })

        afterEach(() => {
            jest.restoreAllMocks()
        })

        it('happy path: inserts one mapping then PATCHes Discord', async () => {
            const existingMapping = {
                id: 'mapping-1',
                messageId,
                roleId: '11111111111111111',
                label: 'Existing',
                emoji: null,
                buttonId: 'reactionrole:11111111111111111',
                type: 'button',
                style: 'Primary',
            }

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Click',
                imageUrl: null,
                mappings: [existingMapping],
            })

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    return typeof callback === 'function'
                        ? callback(mockPrisma)
                        : {}
                },
            )

            mockPrisma.reactionRoleMapping.create.mockResolvedValueOnce({
                id: 'mapping-2',
                messageId,
                roleId: newRoleId,
                label: 'New',
                emoji: null,
                buttonId: `reactionrole:${newRoleId}`,
                type: 'button',
                style: 'Secondary',
            })
            ;(global as any).fetch.mockResolvedValueOnce({ ok: true })

            const result = await service.addRoleToMessage(
                messageId,
                {
                    roleId: newRoleId,
                    label: 'New',
                    emoji: null,
                    style: 'Secondary' as const,
                },
                botToken,
            )

            expect(result.status).toBe('ok')
            expect(result.mapping.roleId).toBe(newRoleId)
        })

        it('DB insert BEFORE Discord PATCH', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Click',
                imageUrl: null,
                mappings: [
                    {
                        id: 'mapping-1',
                        messageId,
                        roleId: '11111111111111111',
                        label: 'Ex',
                        emoji: null,
                        buttonId: 'reactionrole:11111111111111111',
                        type: 'button',
                        style: 'Primary',
                    },
                ],
            })

            const callOrder: string[] = []

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    callOrder.push('tx-start')
                    const result = await callback(mockPrisma)
                    callOrder.push('tx-end')
                    return result
                },
            )

            mockPrisma.reactionRoleMapping.create.mockImplementationOnce(
                async () => {
                    callOrder.push('db-insert')
                    return {
                        id: 'mapping-2',
                        messageId,
                        roleId: newRoleId,
                        label: 'New',
                        emoji: null,
                        buttonId: `reactionrole:${newRoleId}`,
                        type: 'button',
                        style: 'Secondary',
                    }
                },
            )
            ;(global as any).fetch.mockImplementationOnce(async () => {
                callOrder.push('discord-patch')
                return { ok: true }
            })

            await service.addRoleToMessage(
                messageId,
                {
                    roleId: newRoleId,
                    label: 'New',
                    emoji: null,
                    style: 'Secondary' as const,
                },
                botToken,
            )

            expect(callOrder.indexOf('db-insert')).toBeLessThan(
                callOrder.indexOf('discord-patch'),
            )
        })

        it('Discord PATCH fails → partial_success', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Click',
                imageUrl: null,
                mappings: [
                    {
                        id: 'mapping-1',
                        messageId,
                        roleId: '11111111111111111',
                        label: 'Ex',
                        emoji: null,
                        buttonId: 'reactionrole:11111111111111111',
                        type: 'button',
                        style: 'Primary',
                    },
                ],
            })

            const createdMapping = {
                id: 'mapping-2',
                messageId,
                roleId: newRoleId,
                label: 'New',
                emoji: null,
                buttonId: `reactionrole:${newRoleId}`,
                type: 'button',
                style: 'Secondary',
            }

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => callback(mockPrisma),
            )
            mockPrisma.reactionRoleMapping.create.mockResolvedValueOnce(
                createdMapping,
            )
            ;(global as any).fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: jest.fn(),
            } as any)

            const result = await service.addRoleToMessage(
                messageId,
                {
                    roleId: newRoleId,
                    label: 'New',
                    emoji: null,
                    style: 'Secondary' as const,
                },
                botToken,
            )

            expect(result.status).toBe('partial_success')
            expect(result.mapping).toEqual(createdMapping)
        })

        it('25 buttons → rejects', async () => {
            const mappings = Array.from({ length: 25 }, (_, i) => ({
                id: `m-${i}`,
                messageId,
                roleId: `${String(i + 1).padStart(17, '1')}`,
                label: `L${i}`,
                emoji: null,
                buttonId: `b-${i}`,
                type: 'button',
                style: 'Primary',
            }))
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Click',
                imageUrl: null,
                mappings,
            })
            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) =>
                    typeof callback === 'function'
                        ? callback(mockPrisma)
                        : Promise.all(callback),
            )
            mockPrisma.reactionRoleMapping.count.mockResolvedValueOnce(25)

            await expect(
                service.addRoleToMessage(
                    messageId,
                    {
                        roleId: newRoleId,
                        label: 'New',
                        emoji: null,
                        style: 'Secondary' as const,
                    },
                    botToken,
                ),
            ).rejects.toThrow('Message already at capacity')
        })

        it('duplicate roleId → conflict', async () => {
            const existingMapping = {
                id: 'mapping-1',
                messageId,
                roleId: newRoleId,
                label: 'Ex',
                emoji: null,
                buttonId: `reactionrole:${newRoleId}`,
                type: 'button',
                style: 'Primary',
            }
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Click',
                imageUrl: null,
                mappings: [existingMapping],
            })
            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) =>
                    typeof callback === 'function'
                        ? callback(mockPrisma)
                        : Promise.all(callback),
            )
            mockPrisma.reactionRoleMapping.findFirst.mockResolvedValueOnce(
                existingMapping,
            )

            await expect(
                service.addRoleToMessage(
                    messageId,
                    {
                        roleId: newRoleId,
                        label: 'New',
                        emoji: null,
                        style: 'Secondary' as const,
                    },
                    botToken,
                ),
            ).rejects.toThrow('Role already mapped')
        })

        it('NO deleteMany called', async () => {
            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce({
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Click',
                imageUrl: null,
                mappings: [
                    {
                        id: 'mapping-1',
                        messageId,
                        roleId: '11111111111111111',
                        label: 'Ex',
                        emoji: null,
                        buttonId: 'reactionrole:11111111111111111',
                        type: 'button',
                        style: 'Primary',
                    },
                ],
            })

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => callback(mockPrisma),
            )
            mockPrisma.reactionRoleMapping.create.mockResolvedValueOnce({
                id: 'mapping-2',
                messageId,
                roleId: newRoleId,
                label: 'New',
                emoji: null,
                buttonId: `reactionrole:${newRoleId}`,
                type: 'button',
                style: 'Secondary',
            })
            ;(global as any).fetch.mockResolvedValueOnce({ ok: true })

            await service.addRoleToMessage(
                messageId,
                {
                    roleId: newRoleId,
                    label: 'New',
                    emoji: null,
                    style: 'Secondary' as const,
                },
                botToken,
            )

            expect(
                mockPrisma.reactionRoleMapping.deleteMany,
            ).not.toHaveBeenCalled()
        })
    })

    describe('Issue #1540 - Input validation and parseEmoji null handling', () => {
        describe('parseEmoji', () => {
            it('returns null for empty emoji', () => {
                const result = (service as any).parseEmoji('')
                expect(result).toBeNull()
            })

            it('returns null for null emoji', () => {
                const result = (service as any).parseEmoji(null)
                expect(result).toBeNull()
            })

            it('parses custom emoji with id and name', () => {
                const result = (service as any).parseEmoji(
                    '<:smile:123456789012345678>',
                )
                expect(result).toEqual({
                    id: '123456789012345678',
                    name: 'smile',
                    animated: false,
                })
            })

            it('parses animated emoji', () => {
                const result = (service as any).parseEmoji(
                    '<a:spin:123456789012345678>',
                )
                expect(result).toEqual({
                    id: '123456789012345678',
                    name: 'spin',
                    animated: true,
                })
            })

            it('returns text emoji as name', () => {
                const result = (service as any).parseEmoji('😀')
                expect(result).toEqual({ name: '😀' })
            })
        })

        describe('createReactionRoleMessageFromDashboard', () => {
            const guildId = '11111111111111111'
            const channelId = '22222222222222222'
            const invalidRoleId = 'invalid-role-id'
            const validRoleId = '33333333333333333'

            it('validates roleIds in roles array', async () => {
                mockIsEnabled.mockResolvedValueOnce(true)

                const invalidOptions = {
                    guildId,
                    channelId,
                    title: 'Test',
                    description: 'Desc',
                    botToken: 'token',
                    roles: [
                        {
                            roleId: invalidRoleId,
                            label: 'Role 1',
                        },
                    ],
                }

                await expect(
                    service.createReactionRoleMessageFromDashboard(
                        invalidOptions,
                    ),
                ).rejects.toThrow('Invalid messageId')
            })

            it('accepts valid snowflake roleIds', async () => {
                mockIsEnabled.mockResolvedValueOnce(true)

                const validOptions = {
                    guildId,
                    channelId,
                    title: 'Test',
                    description: 'Desc',
                    botToken: 'token',
                    roles: [
                        {
                            roleId: validRoleId,
                            label: 'Role 1',
                        },
                    ],
                }

                mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({
                    id: 'msg-id-1',
                    messageId: 'msg-123',
                })
                ;(global as any).fetch = (
                    jest.fn() as any
                ).mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ id: 'msg-123' }),
                })

                const result =
                    await service.createReactionRoleMessageFromDashboard(
                        validOptions,
                    )

                expect(result.messageId).toBe('msg-123')
                expect(mockPrisma.reactionRoleMessage.create).toHaveBeenCalled()
            })

            it('handles null emoji in buildButtonRows', async () => {
                mockIsEnabled.mockResolvedValueOnce(true)

                const optionsWithNullEmoji = {
                    guildId,
                    channelId,
                    title: 'Test',
                    description: 'Desc',
                    botToken: 'token',
                    roles: [
                        {
                            roleId: validRoleId,
                            label: 'Role 1',
                            emoji: null,
                        },
                    ],
                }

                mockPrisma.reactionRoleMessage.create.mockResolvedValueOnce({
                    id: 'msg-id-1',
                    messageId: 'msg-123',
                })
                ;(global as any).fetch = (
                    jest.fn() as any
                ).mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ id: 'msg-123' }),
                })

                const result =
                    await service.createReactionRoleMessageFromDashboard(
                        optionsWithNullEmoji as any,
                    )

                expect(result.messageId).toBe('msg-123')
            })
        })
    })

    describe('Issue #1555 - Update partial failure rollback', () => {
        const guildId = '11111111111111111'
        const channelId = '22222222222222222'
        const messageId = '33333333333333333'
        const roleId = '44444444444444444'
        const botToken = 'test-token'

        it('rolls back DB changes when Discord update fails', async () => {
            mockIsEnabled.mockResolvedValueOnce(true)

            const originalMessage = {
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Original Title',
                description: 'Original Desc',
                imageUrl: null,
                mappings: [
                    {
                        id: 'mapping-1',
                        messageId,
                        roleId: '55555555555555555',
                        label: 'Role 1',
                        emoji: null,
                        buttonId: 'reactionrole:55555555555555555',
                        type: 'button',
                        style: 'Primary',
                    },
                ],
            }

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce(
                originalMessage,
            )

            let transactionCalls = 0
            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    transactionCalls++
                    return typeof callback === 'function'
                        ? callback(mockPrisma)
                        : Promise.all(callback)
                },
            )

            mockPrisma.reactionRoleMessage.update.mockResolvedValueOnce({
                ...originalMessage,
                title: 'New Title',
                description: 'New Desc',
            })

            // Discord API fails
            ;(global as any).fetch = (jest.fn() as any).mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            })

            // Second transaction for rollback
            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    transactionCalls++
                    return typeof callback === 'function'
                        ? callback(mockPrisma)
                        : Promise.all(callback)
                },
            )

            mockPrisma.reactionRoleMessage.update.mockResolvedValueOnce(
                originalMessage,
            )

            const options = {
                guildId,
                messageId,
                title: 'New Title',
                description: 'New Desc',
                botToken,
                roles: [
                    {
                        roleId: '55555555555555555',
                        label: 'Role 1',
                    },
                ],
            }

            await expect(
                service.updateReactionRoleMessage(options),
            ).rejects.toThrow('Discord API error')

            // Verify rollback transaction was called
            expect(transactionCalls).toBe(2)
        })
    })

    describe('Issue #1558 - Concurrent append serialization', () => {
        const messageId = '11111111111111111'
        const guildId = '22222222222222222'
        const channelId = '33333333333333333'
        const roleId = '44444444444444444'
        const botToken = 'test-token'

        it('enforces capacity check inside transaction', async () => {
            const message = {
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Desc',
                imageUrl: null,
                mappings: Array(25)
                    .fill(null)
                    .map((_, i) => ({
                        id: `mapping-${i}`,
                        messageId,
                        roleId: `${String(i).padStart(17, '0')}`,
                        label: `Role ${i}`,
                        emoji: null,
                        buttonId: `reactionrole:${String(i).padStart(17, '0')}`,
                        type: 'button',
                        style: 'Primary',
                    })),
            }

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce(
                message,
            )

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    const mockTx = {
                        reactionRoleMapping: {
                            count: (jest.fn() as any).mockResolvedValue(25),
                        },
                    }
                    return callback(mockTx)
                },
            )

            await expect(
                service.addRoleToMessage(
                    messageId,
                    {
                        roleId,
                        label: 'New Role',
                    },
                    botToken,
                ),
            ).rejects.toThrow('Message already at capacity')
        })

        it('checks duplicate roleId inside transaction', async () => {
            const message = {
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Desc',
                imageUrl: null,
                mappings: [
                    {
                        id: 'mapping-1',
                        messageId,
                        roleId,
                        label: 'Existing Role',
                        emoji: null,
                        buttonId: `reactionrole:${roleId}`,
                        type: 'button',
                        style: 'Primary',
                    },
                ],
            }

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce(
                message,
            )

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    const mockTx = {
                        reactionRoleMapping: {
                            count: (jest.fn() as any).mockResolvedValue(1),
                            findFirst: (jest.fn() as any).mockResolvedValue({
                                id: 'mapping-1',
                                roleId,
                            }),
                        },
                    }
                    return callback(mockTx)
                },
            )

            await expect(
                service.addRoleToMessage(
                    messageId,
                    {
                        roleId,
                        label: 'Existing Role',
                    },
                    botToken,
                ),
            ).rejects.toThrow('Role already mapped')
        })

        it('successfully inserts when under capacity and no duplicate', async () => {
            const message = {
                id: 'msg-id-1',
                messageId,
                guildId,
                channelId,
                title: 'Test',
                description: 'Desc',
                imageUrl: null,
                mappings: [
                    {
                        id: 'mapping-1',
                        messageId,
                        roleId: '99999999999999999',
                        label: 'Existing Role',
                        emoji: null,
                        buttonId: 'reactionrole:99999999999999999',
                        type: 'button',
                        style: 'Primary',
                    },
                ],
            }

            mockPrisma.reactionRoleMessage.findUnique.mockResolvedValueOnce(
                message,
            )

            const createdMapping = {
                id: 'mapping-2',
                messageId,
                roleId,
                label: 'New Role',
                emoji: null,
                buttonId: `reactionrole:${roleId}`,
                type: 'button',
                style: 'Primary',
            }

            mockPrisma.$transaction.mockImplementationOnce(
                async (callback: any) => {
                    const mockTx = {
                        reactionRoleMapping: {
                            count: (jest.fn() as any).mockResolvedValue(1),
                            findFirst: (jest.fn() as any).mockResolvedValue(
                                null,
                            ),
                            create: (jest.fn() as any).mockResolvedValue(
                                createdMapping,
                            ),
                        },
                    }
                    return callback(mockTx)
                },
            )
            ;(global as any).fetch = (jest.fn() as any).mockResolvedValueOnce({
                ok: true,
            })

            const result = await service.addRoleToMessage(
                messageId,
                {
                    roleId,
                    label: 'New Role',
                },
                botToken,
            )

            expect(result.status).toBe('ok')
            expect(result.mapping.roleId).toBe(roleId)
        })
    })
})
