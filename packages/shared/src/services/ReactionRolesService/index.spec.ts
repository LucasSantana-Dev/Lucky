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
            },
            reactionRoleMapping: {
                findFirst: jest.fn(),
            },
        }
        mockGetPrismaClient.mockReturnValue(mockPrisma)
        mockIsEnabled.mockResolvedValue(true)
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
            }
            const result =
                await service.createReactionRoleMessageFromDashboard(options)
            expect(result.messageId).toBe('msg-new')
        })

        it('throws when feature is disabled', async () => {
            mockIsEnabled.mockResolvedValueOnce(false)
            const options = {
                ...baseOptions,
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                    { roleId: 'role-1', label: 'Role One', emoji: '1️⃣' },
                    {
                        roleId: 'role-2',
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
                                    roleId: 'role-1',
                                    label: 'Role One',
                                    emoji: '1️⃣',
                                }),
                                expect.objectContaining({
                                    roleId: 'role-2',
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                        roleId: 'role-1',
                        label: 'Animated',
                        emoji: '<a:spin:123456>',
                    },
                    {
                        roleId: 'role-2',
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
                roles: [{ roleId: 'role-1', label: 'Heart', emoji: '❤️' }],
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
                roleId: `role-${i}`,
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
                roles: [{ roleId: 'r1', label: 'L1', emoji: '<a:fire:12345>' }],
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
                roles: [{ roleId: 'r1', label: 'L1', emoji: '<:star:98765>' }],
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
                roles: [{ roleId: 'r1', label: 'L1', emoji: '✨' }],
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
                roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
                    roles: [{ roleId: 'role-1', label: 'Role 1' }],
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
})
