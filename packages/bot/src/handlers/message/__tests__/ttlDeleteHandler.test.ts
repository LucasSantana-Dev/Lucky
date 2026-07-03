import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Message } from 'discord.js'
import { ttlDeleteHandler } from '../ttlDeleteHandler'
import type { MessageContext } from '../types'

jest.mock('@lucky/shared/services', () => ({
    channelCleanupService: {
        getConfig: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import { channelCleanupService } from '@lucky/shared/services'

describe('ttlDeleteHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
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

            const result = await ttlDeleteHandler.canHandle(message, context)
            expect(result).toBe(false)
        })

        it('should return true for non-bot messages', async () => {
            const message = {
                author: { bot: false },
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.canHandle(message, context)
            expect(result).toBe(true)
        })
    })

    describe('handle', () => {
        it('should return stop: false when no config exists', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockResolvedValue(null)

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.delete).not.toHaveBeenCalled()
        })

        it('should return stop: false when config is disabled', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockResolvedValue({
                enabled: false,
                mode: 'ttl',
                ttlSeconds: 10,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.delete).not.toHaveBeenCalled()
        })

        it('should return stop: false when mode is not ttl', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                mode: 'purge_interval',
                intervalMinutes: 60,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.delete).not.toHaveBeenCalled()
        })

        it('should return stop: false when ttlSeconds is invalid', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                mode: 'ttl',
                ttlSeconds: 2, // Invalid: less than 5
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)
            expect(message.delete).not.toHaveBeenCalled()
        })

        it('should schedule deletion for valid TTL config', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                mode: 'ttl',
                ttlSeconds: 10,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)

            // Message delete should not be called immediately
            expect(message.delete).not.toHaveBeenCalled()

            // Advance timers to TTL + 100ms; the callback re-checks the
            // config asynchronously, so flush microtasks too.
            await jest.advanceTimersByTimeAsync(10 * 1000 + 100)

            // Now it should be called
            expect(message.delete).toHaveBeenCalledTimes(1)
        })

        it('should silently ignore deletion errors', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockResolvedValue({
                enabled: true,
                mode: 'ttl',
                ttlSeconds: 10,
            })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn().mockRejectedValue(new Error('Message already deleted')),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)

            await jest.advanceTimersByTimeAsync(10 * 1000 + 100)
            expect(message.delete).toHaveBeenCalledTimes(1)
            // No error should be thrown
        })

        it('does not delete when cleanup was disabled before the timer fired', async () => {
            ;(channelCleanupService.getConfig as jest.Mock)
                .mockResolvedValueOnce({
                    enabled: true,
                    mode: 'ttl',
                    ttlSeconds: 10,
                })
                .mockResolvedValueOnce({
                    enabled: false,
                    mode: 'ttl',
                    ttlSeconds: 10,
                })

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn().mockResolvedValue(undefined),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            await ttlDeleteHandler.handle(message, context)
            await jest.advanceTimersByTimeAsync(10 * 1000 + 100)
            expect(message.delete).not.toHaveBeenCalled()
        })

        it('should return stop: false even when an error occurs', async () => {
            ;(channelCleanupService.getConfig as jest.Mock).mockRejectedValue(
                new Error('Service error'),
            )

            const message = {
                author: { id: 'user1', bot: false },
                channelId: 'channel1',
                delete: jest.fn(),
            } as unknown as Message

            const context: MessageContext = {
                guild: { id: 'guild1' } as any,
                member: {} as any,
                featureToggles: {},
            }

            const result = await ttlDeleteHandler.handle(message, context)
            expect(result.stop).toBe(false)
        })
    })
})
