import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Message } from 'discord.js'
import { afkHandler } from '../afkHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    afkService: {
        get: jest.fn(),
        clear: jest.fn(),
        getMany: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { afkService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

describe('afkHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('canHandle', () => {
        it('should return false when message is from a bot', async () => {
            const message = {
                author: { bot: true },
            } as unknown as Message

            const result = await afkHandler.canHandle(message)
            expect(result).toBe(false)
        })

        it('should return true for non-bot messages', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const result = await afkHandler.canHandle(message)
            expect(result).toBe(true)
        })
    })

    describe('handle', () => {
        it('should clear AFK status and reply when author has AFK status', async () => {
            const replyMock = jest.fn().mockResolvedValue(undefined)
            const message = {
                author: { id: 'user1', bot: false },
                mentions: { users: { size: 0 } },
                reply: replyMock,
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            ;(afkService.get as jest.Mock).mockResolvedValue({
                id: 'afk1',
                guildId: 'guild1',
                userId: 'user1',
                reason: 'In a meeting',
                since: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            ;(afkService.clear as jest.Mock).mockResolvedValue(undefined)

            const result = await afkHandler.handle(message, context)

            expect(afkService.get).toHaveBeenCalledWith('guild1', 'user1')
            expect(afkService.clear).toHaveBeenCalledWith('guild1', 'user1')
            expect(replyMock).toHaveBeenCalledWith({
                content: expect.stringContaining('Welcome back'),
                allowedMentions: { parse: [], repliedUser: false },
            })
            expect(result).toEqual({ stop: false })
        })

        it('should skip pipeline and never stop when error occurs', async () => {
            const message = {
                author: { id: 'user1', bot: false },
                mentions: { users: { size: 0 } },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const dbError = new Error('DB error')
            ;(afkService.get as jest.Mock).mockRejectedValue(dbError)

            const result = await afkHandler.handle(message, context)

            // Should always return { stop: false }, never throw
            expect(result).toEqual({ stop: false })
            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({ error: dbError }),
            )
        })

        it('should reply to mentioned users with AFK status', async () => {
            const replyMock = jest.fn().mockResolvedValue(undefined)
            const user1 = { id: 'user2' }
            const user2 = { id: 'user3' }

            const message = {
                author: { id: 'user1', bot: false },
                mentions: {
                    users: new Map([
                        ['user2', user1],
                        ['user3', user2],
                    ]),
                    get: (id: string) =>
                        message.mentions.users.get(id) as any,
                },
                reply: replyMock,
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            ;(afkService.get as jest.Mock).mockResolvedValue(null)
            ;(afkService.getMany as jest.Mock).mockResolvedValue([
                {
                    id: 'afk2',
                    guildId: 'guild1',
                    userId: 'user2',
                    reason: 'Sleeping',
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ])

            const result = await afkHandler.handle(message, context)

            expect(afkService.getMany).toHaveBeenCalledWith('guild1', [
                'user2',
                'user3',
            ])
            expect(replyMock).toHaveBeenCalledWith({
                content: expect.stringContaining('is AFK: Sleeping'),
                allowedMentions: { parse: [], repliedUser: false },
            })
            expect(result).toEqual({ stop: false })
        })

        it('should reply with "is AFK" when no reason provided', async () => {
            const replyMock = jest.fn().mockResolvedValue(undefined)
            const user1 = { id: 'user2' }

            const message = {
                author: { id: 'user1', bot: false },
                mentions: {
                    users: new Map([['user2', user1]]),
                    get: (id: string) =>
                        message.mentions.users.get(id) as any,
                },
                reply: replyMock,
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            ;(afkService.get as jest.Mock).mockResolvedValue(null)
            ;(afkService.getMany as jest.Mock).mockResolvedValue([
                {
                    id: 'afk2',
                    guildId: 'guild1',
                    userId: 'user2',
                    reason: null,
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ])

            await afkHandler.handle(message, context)

            expect(replyMock).toHaveBeenCalledWith({
                content: expect.stringContaining('is AFK'),
                allowedMentions: { parse: [], repliedUser: false },
            })
        })

        it('should limit mention replies to max 3 per message', async () => {
            const mentionedUserIds = Array.from(
                { length: 5 },
                (_, i) => `user${i + 2}`,
            )
            const mentionedUsers = new Map(
                mentionedUserIds.map((id) => [id, { id }]),
            )

            const replyMock = jest.fn().mockResolvedValue(undefined)

            const message = {
                author: { id: 'user1', bot: false },
                mentions: {
                    users: mentionedUsers,
                    get: (id: string) => mentionedUsers.get(id),
                    size: mentionedUsers.size,
                },
                reply: replyMock,
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            ;(afkService.get as jest.Mock).mockResolvedValue(null)
            // Return 5 AFK statuses, but should only reply to 3
            ;(afkService.getMany as jest.Mock).mockResolvedValue([
                {
                    id: 'afk1',
                    guildId: 'guild1',
                    userId: 'user2',
                    reason: 'Away',
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'afk2',
                    guildId: 'guild1',
                    userId: 'user3',
                    reason: 'Busy',
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'afk3',
                    guildId: 'guild1',
                    userId: 'user4',
                    reason: null,
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'afk4',
                    guildId: 'guild1',
                    userId: 'user5',
                    reason: 'Sleeping',
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'afk5',
                    guildId: 'guild1',
                    userId: 'user6',
                    reason: 'Meeting',
                    since: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ])

            await afkHandler.handle(message, context)

            // Should only reply 3 times max
            expect(replyMock).toHaveBeenCalledTimes(3)
        })
    })
})
