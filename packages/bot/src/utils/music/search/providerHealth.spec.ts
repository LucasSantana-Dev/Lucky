import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    ProviderHealthService,
    providerFromQueryType,
    providerFromTrack,
    initProviderHealth,
    providerHealthService,
} from './providerHealth'

const getMock = jest.fn<() => Promise<string | null>>()
const setexMock = jest.fn<() => Promise<void>>()
const isHealthyMock = jest.fn<() => boolean>()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        isHealthy: (...args: unknown[]) => isHealthyMock(...args),
        get: (...args: unknown[]) => getMock(...args),
        setex: (...args: unknown[]) => setexMock(...args),
    },
}))

describe('ProviderHealthService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isHealthyMock.mockReturnValue(false)
    })

    it('marks provider unavailable after consecutive failures', () => {
        const service = new ProviderHealthService({
            cooldownMs: 5_000,
            failureThreshold: 2,
        })
        const now = 1_000

        service.recordFailure('youtube', now, 'first failure')
        expect(service.isAvailable('youtube', now + 1)).toBe(true)

        service.recordFailure('youtube', now + 2, 'second failure')
        expect(service.isAvailable('youtube', now + 3)).toBe(false)
        expect(service.isAvailable('youtube', now + 5_100)).toBe(true)
    })

    it('recovers score and consecutive failures after success', () => {
        const service = new ProviderHealthService({
            cooldownMs: 5_000,
            failureThreshold: 2,
        })
        const now = 2_000

        service.recordFailure('spotify', now, 'fail')
        service.recordFailure('spotify', now + 1, 'fail')
        expect(service.getStatus('spotify').consecutiveFailures).toBe(2)

        service.recordSuccess('spotify', now + 6_000)

        const status = service.getStatus('spotify')
        expect(status.consecutiveFailures).toBe(0)
        expect(status.score).toBeGreaterThan(0.5)
        expect(service.isAvailable('spotify', now + 6_001)).toBe(true)
    })

    it('returns providers ordered by health score and availability', () => {
        const service = new ProviderHealthService({
            cooldownMs: 10_000,
            failureThreshold: 2,
        })
        const now = 4_000

        service.recordFailure('spotify', now, 'timeout')
        service.recordFailure('spotify', now + 1, 'timeout')
        service.recordSuccess('youtube', now + 2)
        service.recordSuccess('soundcloud', now + 3)

        const ordered = service.getOrderedProviders(
            ['spotify', 'youtube', 'soundcloud'],
            now + 100,
        )

        expect(ordered[0]).toBe('youtube')
        expect(ordered).not.toContain('spotify')
    })

    it('exposes all provider statuses and handles unknown providers safely', () => {
        const service = new ProviderHealthService({
            cooldownMs: 1_000,
            failureThreshold: 1,
            failurePenalty: 0.3,
            successBoost: 0.2,
        })

        service.recordFailure('unknown', 10, 'unknown failure')
        const status = service.getStatus('unknown')
        const all = service.getAllStatuses()

        expect(status.lastError).toBe('unknown failure')
        expect(status.score).toBe(0.7)
        expect(all.youtube.provider).toBe('youtube')
        expect(all.soundcloud.provider).toBe('soundcloud')
        expect(all.unknown.provider).toBe('unknown')
    })

    it('keeps score within [0, 1] boundaries', () => {
        const service = new ProviderHealthService({
            cooldownMs: 1_000,
            failureThreshold: 10,
            failurePenalty: 0.6,
            successBoost: 0.8,
        })

        service.recordFailure('youtube', 10, 'fail-1')
        service.recordFailure('youtube', 20, 'fail-2')
        expect(service.getStatus('youtube').score).toBe(0)

        service.recordSuccess('youtube', 30)
        service.recordSuccess('youtube', 40)
        expect(service.getStatus('youtube').score).toBe(1)
    })
})

describe('ProviderHealthService cooldown boundary conditions', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isHealthyMock.mockReturnValue(false)
    })

    it('clears cooldownUntil in-place when expiry is reached on isAvailable call', () => {
        const service = new ProviderHealthService({
            cooldownMs: 1_000,
            failureThreshold: 1,
        })
        const now = 5_000

        service.recordFailure('youtube', now, 'fail')
        expect(service.isAvailable('youtube', now + 500)).toBe(false)
        // Cooldown still set before expiry
        expect(service.getStatus('youtube').cooldownUntil).not.toBeNull()

        // At expiry boundary, isAvailable clears cooldownUntil in-place
        expect(service.isAvailable('youtube', now + 1_000)).toBe(true)
        expect(service.getStatus('youtube').cooldownUntil).toBeNull()
    })

    it('deprioritizes degraded-but-available provider relative to healthy one', () => {
        const service = new ProviderHealthService({
            cooldownMs: 10_000,
            failureThreshold: 3,
            failurePenalty: 0.3,
        })
        const now = 1_000

        // Degrade spotify (score: 0.7) but not yet in cooldown
        service.recordFailure('spotify', now, 'partial fail')
        // youtube untouched (score: 1.0)

        const ordered = service.getOrderedProviders(
            ['spotify', 'youtube'],
            now + 100,
        )
        expect(ordered[0]).toBe('youtube')
        expect(ordered[1]).toBe('spotify')
    })

    it('excludes on-cooldown providers while ordering remaining by score', () => {
        const service = new ProviderHealthService({
            cooldownMs: 5_000,
            failureThreshold: 1,
            failurePenalty: 0.4,
        })
        const now = 1_000

        // soundcloud goes into cooldown
        service.recordFailure('soundcloud', now, 'fail')
        // spotify degraded but available
        service.recordFailure('spotify', now, 'degraded')
        service.recordSuccess('spotify', now)
        // youtube healthy
        service.recordSuccess('youtube', now)

        const ordered = service.getOrderedProviders(
            ['soundcloud', 'spotify', 'youtube'],
            now + 100,
        )

        expect(ordered).not.toContain('soundcloud')
        expect(ordered[0]).toBe('youtube')
    })

    it('returns empty array when all providers are on cooldown', () => {
        const service = new ProviderHealthService({
            cooldownMs: 60_000,
            failureThreshold: 1,
        })
        const now = 1_000

        service.recordFailure('youtube', now)
        service.recordFailure('spotify', now)
        service.recordFailure('soundcloud', now)

        const ordered = service.getOrderedProviders(
            ['youtube', 'spotify', 'soundcloud'],
            now + 100,
        )
        expect(ordered).toHaveLength(0)
    })
})

describe('provider mappers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isHealthyMock.mockReturnValue(false)
    })

    it('maps query types to providers', () => {
        expect(providerFromQueryType('youtubeSearch' as any)).toBe('youtube')
        expect(providerFromQueryType('spotifySearch' as any)).toBe('spotify')
        expect(providerFromQueryType('soundcloud' as any)).toBe('soundcloud')
        expect(providerFromQueryType('otherSearch' as any)).toBe('unknown')
        expect(providerFromQueryType(undefined as any)).toBe('unknown')
    })

    it('maps track source/url to providers', () => {
        expect(
            providerFromTrack({
                source: 'YouTube',
                url: 'https://youtube.com/watch?v=abc',
            }),
        ).toBe('youtube')
        expect(
            providerFromTrack({
                source: 'spotify',
                url: 'https://spotify.com/track/1',
            }),
        ).toBe('spotify')
        expect(
            providerFromTrack({
                source: 'soundcloud',
                url: 'https://soundcloud.com/track',
            }),
        ).toBe('soundcloud')
        expect(
            providerFromTrack({ source: 'other', url: 'https://x.com' }),
        ).toBe('unknown')
    })
})

describe('ProviderHealthService Redis persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isHealthyMock.mockReturnValue(true)
        setexMock.mockResolvedValue(undefined)
    })

    it('calls setex on recordFailure when Redis is healthy', () => {
        const service = new ProviderHealthService({
            cooldownMs: 10_000,
            failureThreshold: 2,
        })
        service.recordFailure('youtube', 1_000, 'timeout')

        expect(isHealthyMock).toHaveBeenCalled()
        expect(setexMock).toHaveBeenCalledWith(
            'music:provider_health:youtube',
            expect.any(Number),
            expect.stringContaining('youtube'),
        )
    })

    it('calls setex on recordSuccess when Redis is healthy', () => {
        const service = new ProviderHealthService({
            cooldownMs: 10_000,
            failureThreshold: 2,
        })
        service.recordSuccess('spotify', 2_000)

        expect(setexMock).toHaveBeenCalledWith(
            'music:provider_health:spotify',
            expect.any(Number),
            expect.stringContaining('spotify'),
        )
    })

    it('skips setex when Redis is not healthy', () => {
        isHealthyMock.mockReturnValue(false)
        const service = new ProviderHealthService({
            cooldownMs: 10_000,
            failureThreshold: 2,
        })
        service.recordFailure('soundcloud', 1_000, 'fail')

        expect(setexMock).not.toHaveBeenCalled()
    })

    it('uses TTL of cooldownMs * 2 / 1000 seconds', () => {
        const service = new ProviderHealthService({
            cooldownMs: 60_000,
            failureThreshold: 1,
        })
        service.recordFailure('youtube', 1_000, 'fail')

        const ttlArg = (setexMock.mock.calls[0] as unknown[])[1]
        expect(ttlArg).toBe(120)
    })
})

describe('initProviderHealth / loadFromRedis', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        isHealthyMock.mockReturnValue(true)
    })

    it('restores provider status from Redis on init', async () => {
        const restoredStatus = {
            provider: 'youtube',
            score: 0.4,
            consecutiveFailures: 2,
            cooldownUntil: Date.now() + 50_000,
            lastFailureAt: Date.now() - 1_000,
            lastSuccessAt: null,
            lastError: 'rate limited',
        }
        getMock.mockImplementation(async (key: unknown) => {
            if ((key as string).includes('youtube'))
                return JSON.stringify(restoredStatus)
            return null
        })

        await initProviderHealth()

        const status = providerHealthService.getStatus('youtube')
        expect(status.score).toBeCloseTo(0.4)
        expect(status.consecutiveFailures).toBe(2)
        expect(status.lastError).toBe('rate limited')
    })

    it('skips loading when Redis is not healthy', async () => {
        isHealthyMock.mockReturnValue(false)

        await initProviderHealth()

        expect(getMock).not.toHaveBeenCalled()
    })

    it('leaves default state when Redis key is missing', async () => {
        getMock.mockResolvedValue(null)

        await initProviderHealth()

        const status = providerHealthService.getStatus('soundcloud')
        expect(status.score).toBe(1)
        expect(status.consecutiveFailures).toBe(0)
    })

    it('ignores corrupt Redis data and keeps default state', async () => {
        getMock.mockResolvedValue('not-valid-json{{')

        await expect(initProviderHealth()).resolves.not.toThrow()
    })
})
