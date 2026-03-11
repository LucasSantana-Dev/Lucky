import { describe, expect, it } from '@jest/globals'
import {
    ProviderHealthService,
    providerFromQueryType,
    providerFromTrack,
} from './providerHealth'

describe('ProviderHealthService', () => {
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

describe('provider mappers', () => {
    it('maps query types to providers', () => {
        expect(providerFromQueryType('youtubeSearch' as any)).toBe('youtube')
        expect(providerFromQueryType('spotifySearch' as any)).toBe('spotify')
        expect(providerFromQueryType('soundcloud' as any)).toBe('soundcloud')
        expect(providerFromQueryType('appleMusicSearch' as any)).toBe('unknown')
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
            providerFromTrack({
                source: 'applemusic',
                url: 'https://music.apple.com/us/album/test',
            }),
        ).toBe('unknown')
        expect(
            providerFromTrack({ source: 'other', url: 'https://x.com' }),
        ).toBe('unknown')
    })
})
