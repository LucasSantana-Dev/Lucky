import { describe, expect, it, jest } from '@jest/globals'
import {
    isAutoplayPaused,
    clearAutoplayPause,
    evaluateSkipRateBreaker,
} from './skipCircuitBreaker'
import * as telemetryReadService from '@lucky/shared/services/recommendationTelemetryReadService'
import type { GuildQueue } from 'discord-player'

jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))
jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))

describe('skipCircuitBreaker', () => {
    const mockGuildId = 'guild-123'

    describe('isAutoplayPaused', () => {
        it('returns false when not paused', () => {
            expect(isAutoplayPaused('unknown-guild')).toBe(false)
        })
    })

    describe('clearAutoplayPause', () => {
        it('clears pause state for a guild', async () => {
            // Set up paused state
            const mockQueue = {
                guild: { id: mockGuildId },
                metadata: { channel: null },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: 0.8,
                sampleSize: 10,
                acceptedCount: 2,
                rejectedCount: 8,
                canTrip: true,
            })

            // Trigger breaker
            await evaluateSkipRateBreaker(mockQueue)
            expect(isAutoplayPaused(mockGuildId)).toBe(true)

            // Clear it
            clearAutoplayPause(mockGuildId)
            expect(isAutoplayPaused(mockGuildId)).toBe(false)
        })
    })

    describe('evaluateSkipRateBreaker', () => {
        beforeEach(() => {
            jest.clearAllMocks()
        })

        it('returns true when skip rate < threshold (no pause)', async () => {
            const mockQueue = {
                guild: { id: mockGuildId },
                metadata: { channel: null },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: 0.4, // 40% < 60% threshold
                sampleSize: 10,
                acceptedCount: 6,
                rejectedCount: 4,
                canTrip: true,
            })

            const result = await evaluateSkipRateBreaker(mockQueue)
            expect(result).toBe(true)
            expect(isAutoplayPaused(mockGuildId)).toBe(false)
        })

        it('returns false and pauses when skip rate > threshold (sample >= 5)', async () => {
            const mockChannel = {
                send: jest.fn().mockResolvedValue(undefined),
            }
            const mockQueue = {
                guild: { id: mockGuildId },
                metadata: { channel: mockChannel },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: 0.7, // 70% > 60% threshold
                sampleSize: 10,
                acceptedCount: 3,
                rejectedCount: 7,
                canTrip: true,
            })

            const result = await evaluateSkipRateBreaker(mockQueue)
            expect(result).toBe(false)
            expect(isAutoplayPaused(mockGuildId)).toBe(true)
            expect(mockChannel.send).toHaveBeenCalledWith({
                content: expect.stringContaining('70%'),
            })
        })

        it('returns true when sample < minimum (never pauses)', async () => {
            const mockQueue = {
                guild: { id: mockGuildId + '-2' },
                metadata: { channel: null },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: 0.8, // 80%, but not enough samples
                sampleSize: 3, // < 5
                acceptedCount: 1,
                rejectedCount: 2,
                canTrip: false, // Can't trip with low sample
            })

            const result = await evaluateSkipRateBreaker(mockQueue)
            expect(result).toBe(true)
            expect(isAutoplayPaused(mockGuildId + '-2')).toBe(false)
        })

        it('posts notice only once per pause', async () => {
            const mockChannel = {
                send: jest.fn().mockResolvedValue(undefined),
            }
            const guildId = 'guild-once-test'
            const mockQueue = {
                guild: { id: guildId },
                metadata: { channel: mockChannel },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: 0.75,
                sampleSize: 10,
                acceptedCount: 2,
                rejectedCount: 8,
                canTrip: true,
            })

            // First call: trips breaker and posts notice
            const result1 = await evaluateSkipRateBreaker(mockQueue)
            expect(result1).toBe(false)
            expect(mockChannel.send).toHaveBeenCalledTimes(1)
            expect(isAutoplayPaused(guildId)).toBe(true)

            // Clear the mock to verify it won't be called again
            mockChannel.send.mockClear()

            // Second call: already paused, doesn't post again
            const result2 = await evaluateSkipRateBreaker(mockQueue)
            expect(result2).toBe(false)
            expect(mockChannel.send).not.toHaveBeenCalled()
        })

        it('returns true when skip rate is null (no data)', async () => {
            const mockQueue = {
                guild: { id: mockGuildId + '-null' },
                metadata: { channel: null },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: null, // No resolved outcomes
                sampleSize: 0,
                acceptedCount: 0,
                rejectedCount: 0,
                canTrip: false,
            })

            const result = await evaluateSkipRateBreaker(mockQueue)
            expect(result).toBe(true)
            expect(isAutoplayPaused(mockGuildId + '-null')).toBe(false)
        })

        it('fails open (returns true) on query error', async () => {
            const mockQueue = {
                guild: { id: mockGuildId + '-error' },
                metadata: { channel: null },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockRejectedValueOnce(new Error('DB error'))

            const result = await evaluateSkipRateBreaker(mockQueue)
            expect(result).toBe(true)
            expect(isAutoplayPaused(mockGuildId + '-error')).toBe(false)
        })

        it('still pauses even if notice send fails', async () => {
            const mockChannel = {
                send: jest
                    .fn()
                    .mockRejectedValue(new Error('Channel send failed')),
            }
            const guildId = 'guild-fail-notice'
            const mockQueue = {
                guild: { id: guildId },
                metadata: { channel: mockChannel },
            } as any as GuildQueue

            ;(
                telemetryReadService.getAutoplaySkipRateForGuild as jest.Mock
            ).mockResolvedValueOnce({
                skipRate: 0.65,
                sampleSize: 10,
                acceptedCount: 3,
                rejectedCount: 7,
                canTrip: true,
            })

            const result = await evaluateSkipRateBreaker(mockQueue)
            expect(result).toBe(false)
            expect(isAutoplayPaused(guildId)).toBe(true)
            expect(mockChannel.send).toHaveBeenCalled()
        })
    })
})
