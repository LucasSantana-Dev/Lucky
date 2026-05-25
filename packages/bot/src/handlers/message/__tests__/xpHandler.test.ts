import { describe, expect, it, jest } from '@jest/globals'
import type { Message, TextChannel } from 'discord.js'
import { xpHandler } from '../xpHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    levelService: {
        getConfig: jest.fn(),
        getMemberXP: jest.fn(),
        addXP: jest.fn(),
        getRewards: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { levelService } from '@lucky/shared/services'

describe('xpHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('canHandle', () => {
        it('should return false when message is from a bot', async () => {
            const message = {
                author: { bot: true },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.canHandle(message, context)
            expect(result).toBe(false)
        })

        it('should return true even when guild exists (canHandle does not check guild)', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.canHandle(message, context)
            expect(result).toBe(true)
        })

        it('should return true for valid non-bot guild message', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.canHandle(message, context)
            expect(result).toBe(true)
        })
    })

    describe('handle', () => {
        it('should return stop: false when config is null', async () => {
            ;(levelService.getConfig as jest.Mock).mockResolvedValue(null)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should return stop: false when config is disabled', async () => {
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: false,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should return stop: false when on cooldown', async () => {
            const now = Date.now()
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue({
                lastXpAt: new Date(now - 30000), // 30 seconds ago
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(levelService.addXP).not.toHaveBeenCalled()
        })

        it('should add XP and return stop: false on success', async () => {
            const now = Date.now()
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue({
                lastXpAt: new Date(now - 61000), // 61 seconds ago, past cooldown
            })
            ;(levelService.addXP as jest.Mock).mockResolvedValue({
                leveledUp: false,
                newLevel: 1,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(levelService.addXP).toHaveBeenCalledWith(
                'guild1',
                'user1',
                10,
            )
        })

        it('should announce level-up when leveledUp is true and announceChannel exists', async () => {
            const now = Date.now()
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
                announceChannel: 'announce1',
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue({
                lastXpAt: new Date(now - 61000),
            })
            ;(levelService.addXP as jest.Mock).mockResolvedValue({
                leveledUp: true,
                newLevel: 5,
            })
            ;(levelService.getRewards as jest.Mock).mockResolvedValue([])

            const mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                send: jest.fn().mockResolvedValue(undefined),
            }

            const message = {
                author: {
                    id: 'user1',
                    bot: false,
                    toString: jest.fn(() => '<@user1>'),
                },
                channelId: 'channel1',
                client: {
                    channels: {
                        fetch: jest.fn().mockResolvedValue(mockChannel),
                    },
                },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: { roles: { add: jest.fn() } } as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(mockChannel.send).toHaveBeenCalledWith(
                expect.stringContaining('level **5**'),
            )
        })

        it('should assign role reward when level matches', async () => {
            const now = Date.now()
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
                announceChannel: 'announce1',
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue({
                lastXpAt: new Date(now - 61000),
            })
            ;(levelService.addXP as jest.Mock).mockResolvedValue({
                leveledUp: true,
                newLevel: 5,
            })
            ;(levelService.getRewards as jest.Mock).mockResolvedValue([
                { level: 5, roleId: 'role5' },
                { level: 10, roleId: 'role10' },
            ])

            const mockChannel = {
                isTextBased: jest.fn().mockReturnValue(true),
                send: jest.fn().mockResolvedValue(undefined),
            }

            const message = {
                author: {
                    id: 'user1',
                    bot: false,
                    toString: jest.fn(() => '<@user1>'),
                },
                channelId: 'channel1',
                client: {
                    channels: {
                        fetch: jest.fn().mockResolvedValue(mockChannel),
                    },
                },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { add: jest.fn().mockResolvedValue(undefined) },
                } as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(context.member.roles.add).toHaveBeenCalledWith('role5')
        })

        it('should handle first-time XP addition with no prior record', async () => {
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue(null)
            ;(levelService.addXP as jest.Mock).mockResolvedValue({
                leveledUp: false,
                newLevel: 1,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(levelService.addXP).toHaveBeenCalledWith(
                'guild1',
                'user1',
                10,
            )
        })

        it('should handle error when channels.fetch fails on level up', async () => {
            const now = Date.now()
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
                announceChannel: 'announce1',
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue({
                lastXpAt: new Date(now - 61000),
            })
            ;(levelService.addXP as jest.Mock).mockResolvedValue({
                leveledUp: true,
                newLevel: 5,
            })

            const message = {
                author: {
                    id: 'user1',
                    bot: false,
                    toString: jest.fn(() => '<@user1>'),
                },
                channelId: 'channel1',
                client: {
                    channels: {
                        fetch: jest
                            .fn()
                            .mockRejectedValue(new Error('Channel not found')),
                    },
                },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: { roles: { add: jest.fn() } } as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should handle error when addXP throws', async () => {
            const now = Date.now()
            ;(levelService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                xpCooldownMs: 60000,
                xpPerMessage: 10,
            })
            ;(levelService.getMemberXP as jest.Mock).mockResolvedValue({
                lastXpAt: new Date(now - 61000),
            })
            ;(levelService.addXP as jest.Mock).mockRejectedValue(
                new Error('Database error'),
            )

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await xpHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })
    })
})
