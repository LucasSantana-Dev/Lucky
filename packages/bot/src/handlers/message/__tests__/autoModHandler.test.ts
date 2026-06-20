import { describe, expect, it, jest } from '@jest/globals'
import type { Message, GuildMember } from 'discord.js'
import { autoModHandler } from '../autoModHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    autoModService: {
        getSettings: jest.fn(),
        checkCaps: jest.fn(),
        checkLinks: jest.fn(),
        checkInvites: jest.fn(),
        checkWords: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

import { autoModService } from '@lucky/shared/services'
import { warnLog } from '@lucky/shared/utils'

describe('autoModHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('canHandle', () => {
        it('should return false when AUTOMOD feature toggle is false', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: false },
            }

            const result = await autoModHandler.canHandle(message, context)
            expect(result).toBe(false)
        })

        it('should return false when message is from a bot', async () => {
            const message = {
                author: { bot: true },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await autoModHandler.canHandle(message, context)
            expect(result).toBe(false)
        })

        it('should return true for valid non-bot message with AUTOMOD enabled', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await autoModHandler.canHandle(message, context)
            expect(result).toBe(true)
        })
    })

    describe('handle', () => {
        it('should return stop: false when settings are null', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(null)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await autoModHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should return stop: false when channel is exempt', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: ['channel1'],
                exemptRoles: [],
                capsEnabled: true,
                linksEnabled: true,
                invitesEnabled: true,
                wordsEnabled: true,
            })

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'HELLO',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await autoModHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should return stop: false when role is exempt', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: [],
                exemptRoles: ['role1'],
                capsEnabled: true,
                linksEnabled: true,
                invitesEnabled: true,
                wordsEnabled: true,
            })

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel2',
                content: 'HELLO',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: {
                        cache: { map: jest.fn().mockReturnValue(['role1']) },
                    },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await autoModHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should detect caps violations', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: [],
                exemptRoles: [],
                capsEnabled: true,
                linksEnabled: false,
                invitesEnabled: false,
                wordsEnabled: false,
            })
            ;(autoModService.checkCaps as jest.Mock).mockResolvedValue(true)

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'HELLO',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            // Verify checkCaps was called
            await autoModHandler.handle(message, context)
            expect(autoModService.checkCaps).toHaveBeenCalledWith(
                'guild1',
                'HELLO',
            )
        })

        it('should detect links violations', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: [],
                exemptRoles: [],
                capsEnabled: false,
                linksEnabled: true,
                invitesEnabled: false,
                wordsEnabled: false,
            })
            ;(autoModService.checkLinks as jest.Mock).mockResolvedValue(true)

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'http://example.com',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            // Verify checkLinks was called
            await autoModHandler.handle(message, context)
            expect(autoModService.checkLinks).toHaveBeenCalledWith(
                'guild1',
                'http://example.com',
                'channel1',
            )
        })

        it('should detect invites violations', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: [],
                exemptRoles: [],
                capsEnabled: false,
                linksEnabled: false,
                invitesEnabled: true,
                wordsEnabled: false,
            })
            ;(autoModService.checkInvites as jest.Mock).mockResolvedValue(true)

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'discord.gg/example',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            // Verify checkInvites was called
            await autoModHandler.handle(message, context)
            expect(autoModService.checkInvites).toHaveBeenCalledWith(
                'guild1',
                'discord.gg/example',
            )
        })

        it('should detect bad words violations', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: [],
                exemptRoles: [],
                capsEnabled: false,
                linksEnabled: false,
                invitesEnabled: false,
                wordsEnabled: true,
            })
            ;(autoModService.checkWords as jest.Mock).mockResolvedValue(true)

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'badword',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            // Verify checkWords was called
            await autoModHandler.handle(message, context)
            expect(autoModService.checkWords).toHaveBeenCalledWith(
                'guild1',
                'badword',
            )
        })

        it('should return stop: false when no violations', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                exemptChannels: [],
                exemptRoles: [],
                capsEnabled: true,
                linksEnabled: true,
                invitesEnabled: true,
                wordsEnabled: true,
            })
            ;(autoModService.checkCaps as jest.Mock).mockResolvedValue(false)
            ;(autoModService.checkLinks as jest.Mock).mockResolvedValue(false)
            ;(autoModService.checkInvites as jest.Mock).mockResolvedValue(false)
            ;(autoModService.checkWords as jest.Mock).mockResolvedValue(false)

            const message = {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'normal message',
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await autoModHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })
    })

    describe('bot permission gating (event-driven)', () => {
        const baseSettings = {
            exemptChannels: [],
            exemptRoles: [],
            capsEnabled: true,
            linksEnabled: false,
            invitesEnabled: false,
            wordsEnabled: false,
        }
        // Build per-test (after beforeEach's clearAllMocks) so the roles mock
        // keeps its return value.
        function makeContext(): MessageContext {
            return {
                guild: { id: 'guild1' } as any,
                member: {
                    roles: { cache: { map: jest.fn().mockReturnValue([]) } },
                } as any,
                featureToggles: { AUTOMOD: true },
            }
        }
        function makeMessage(botCanDelete: boolean): Message {
            return {
                author: { id: 'user1', bot: false, tag: 'user#1' },
                channelId: 'channel1',
                content: 'HELLO',
                delete: jest.fn().mockResolvedValue(undefined),
                client: { user: { id: 'bot1', tag: 'bot#1' } },
                guild: {
                    id: 'guild1',
                    members: { me: { permissions: { has: () => true } } },
                },
                channel: {
                    permissionsFor: jest
                        .fn()
                        .mockReturnValue({ has: () => botCanDelete }),
                },
            } as unknown as Message
        }

        it('skips message delete and warns when bot lacks ManageMessages', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(
                baseSettings,
            )
            ;(autoModService.checkCaps as jest.Mock).mockResolvedValue(true)
            const message = makeMessage(false)
            const context = makeContext()

            await autoModHandler.handle(message, context)

            expect(autoModService.checkCaps).toHaveBeenCalled()
            expect(message.delete).not.toHaveBeenCalled()
            expect(warnLog).toHaveBeenCalled()
        })

        it('deletes the message when bot has ManageMessages', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue(
                baseSettings,
            )
            ;(autoModService.checkCaps as jest.Mock).mockResolvedValue(true)
            const message = makeMessage(true)
            const context = makeContext()

            await autoModHandler.handle(message, context)

            expect(message.delete).toHaveBeenCalled()
        })
    })
})
