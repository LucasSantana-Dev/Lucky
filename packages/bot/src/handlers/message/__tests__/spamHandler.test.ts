import { describe, expect, it, jest } from '@jest/globals'
import type { Message } from 'discord.js'
import { spamHandler } from '../spamHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    autoModService: {
        getSettings: jest.fn(),
        trackMessageAndCheckSpam: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { autoModService } from '@lucky/shared/services'

describe('spamHandler', () => {
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

            const result = await spamHandler.canHandle(message, context)
            expect(result).toBe(false)
        })

        it('should return false when message is from a bot', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                spamEnabled: true,
            })

            const message = {
                author: { bot: true },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.canHandle(message, context)
            expect(result).toBe(false)
        })

        it('should return true for valid non-bot message with AUTOMOD enabled and spamEnabled true', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                spamEnabled: true,
            })

            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.canHandle(message, context)
            expect(result).toBe(true)
        })

        it('should return false when spamEnabled is false in settings', async () => {
            ;(autoModService.getSettings as jest.Mock).mockResolvedValue({
                spamEnabled: false,
            })

            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.canHandle(message, context)
            expect(result).toBe(false)
        })
    })

    describe('handle', () => {
        it('should return stop: false when settings are null', async () => {
            ;(
                autoModService.trackMessageAndCheckSpam as jest.Mock
            ).mockResolvedValue(false)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })

        it('should return stop: true when spam detected', async () => {
            ;(
                autoModService.trackMessageAndCheckSpam as jest.Mock
            ).mockResolvedValue(true)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.handle(message, context)
            expect(result.stop).toBe(true)
            expect(message.delete).toHaveBeenCalled()
        })

        it('should return stop: false when no spam', async () => {
            ;(
                autoModService.trackMessageAndCheckSpam as jest.Mock
            ).mockResolvedValue(false)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.delete).not.toHaveBeenCalled()
        })

        it('should handle error when trackMessageAndCheckSpam throws', async () => {
            const error = new Error('Service error')
            ;(
                autoModService.trackMessageAndCheckSpam as jest.Mock
            ).mockRejectedValue(error)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: { AUTOMOD: true },
            }

            const result = await spamHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })
    })
})
