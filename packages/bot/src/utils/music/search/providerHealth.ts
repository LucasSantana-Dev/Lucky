import { QueryType } from 'discord-player'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog } from '@lucky/shared/utils'

export type MusicProvider = 'youtube' | 'spotify' | 'soundcloud' | 'unknown'

export type ProviderStatus = {
    provider: MusicProvider
    score: number
    consecutiveFailures: number
    cooldownUntil: number | null
    lastFailureAt: number | null
    lastSuccessAt: number | null
    lastError: string | null
}

type ProviderHealthOptions = {
    cooldownMs?: number
    failureThreshold?: number
    failurePenalty?: number
    successBoost?: number
}

const DEFAULT_PROVIDERS: MusicProvider[] = [
    'youtube',
    'spotify',
    'soundcloud',
    'unknown',
]

const DEFAULT_OPTIONS = {
    cooldownMs: 120_000,
    failureThreshold: 3,
    failurePenalty: 0.2,
    successBoost: 0.05,
} satisfies Required<ProviderHealthOptions>

const REDIS_KEY_PREFIX = 'music:provider_health:'

function redisKey(provider: MusicProvider): string {
    return `${REDIS_KEY_PREFIX}${provider}`
}

function createInitialStatus(provider: MusicProvider): ProviderStatus {
    return {
        provider,
        score: 1,
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastFailureAt: null,
        lastSuccessAt: null,
        lastError: null,
    }
}

export class ProviderHealthService {
    private readonly options: Required<ProviderHealthOptions>
    private readonly statuses = new Map<MusicProvider, ProviderStatus>()

    constructor(options: ProviderHealthOptions = {}) {
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
        }

        for (const provider of DEFAULT_PROVIDERS) {
            this.statuses.set(provider, createInitialStatus(provider))
        }
    }

    private ensure(provider: MusicProvider): ProviderStatus {
        const existing = this.statuses.get(provider)
        if (existing) return existing
        const status = createInitialStatus(provider)
        this.statuses.set(provider, status)
        return status
    }

    private persistToRedis(status: ProviderStatus): void {
        if (!redisClient.isHealthy()) return
        const ttlSeconds = Math.ceil((this.options.cooldownMs * 2) / 1000)
        redisClient
            .setex(redisKey(status.provider), ttlSeconds, JSON.stringify(status))
            .catch((err) => {
                errorLog({ message: 'Failed to persist provider health', error: err })
            })
    }

    async loadFromRedis(): Promise<void> {
        if (!redisClient.isHealthy()) return
        for (const provider of DEFAULT_PROVIDERS) {
            try {
                const raw = await redisClient.get(redisKey(provider))
                if (!raw) continue
                const parsed: ProviderStatus = JSON.parse(raw) as ProviderStatus
                if (parsed.provider === provider) {
                    this.statuses.set(provider, parsed)
                    debugLog({
                        message: `Restored provider health from Redis: ${provider}`,
                        data: { score: parsed.score, cooldownUntil: parsed.cooldownUntil },
                    })
                }
            } catch {
                // leave default in-memory state if Redis data is corrupt
            }
        }
    }

    recordFailure(
        provider: MusicProvider,
        now = Date.now(),
        error?: string,
    ): void {
        const status = this.ensure(provider)

        status.consecutiveFailures += 1
        status.lastFailureAt = now
        status.lastError = error ?? null
        status.score = Math.max(0, status.score - this.options.failurePenalty)

        if (status.consecutiveFailures >= this.options.failureThreshold) {
            status.cooldownUntil = now + this.options.cooldownMs
        }

        this.persistToRedis(status)
    }

    recordSuccess(provider: MusicProvider, now = Date.now()): void {
        const status = this.ensure(provider)

        status.consecutiveFailures = 0
        status.lastSuccessAt = now
        status.cooldownUntil = null
        status.lastError = null
        status.score = Math.min(1, status.score + this.options.successBoost)

        this.persistToRedis(status)
    }

    isAvailable(provider: MusicProvider, now = Date.now()): boolean {
        const status = this.ensure(provider)
        if (status.cooldownUntil === null) return true
        if (now >= status.cooldownUntil) {
            status.cooldownUntil = null
            return true
        }
        return false
    }

    getStatus(provider: MusicProvider): ProviderStatus {
        return { ...this.ensure(provider) }
    }

    getAllStatuses(): Record<MusicProvider, ProviderStatus> {
        const result = {} as Record<MusicProvider, ProviderStatus>
        for (const provider of DEFAULT_PROVIDERS) {
            result[provider] = this.getStatus(provider)
        }
        return result
    }

    getOrderedProviders(
        providers: MusicProvider[],
        now = Date.now(),
    ): MusicProvider[] {
        return [...providers]
            .filter((provider) => this.isAvailable(provider, now))
            .sort((a, b) => this.getStatus(b).score - this.getStatus(a).score)
    }
}

export const providerHealthService = new ProviderHealthService({
    cooldownMs: Number.parseInt(
        process.env.MUSIC_PROVIDER_COOLDOWN_MS ?? '120000',
        10,
    ),
    failureThreshold: Number.parseInt(
        process.env.MUSIC_PROVIDER_FAILURE_THRESHOLD ?? '2',
        10,
    ),
})

export async function initProviderHealth(): Promise<void> {
    await providerHealthService.loadFromRedis()
}

export function providerFromQueryType(queryType?: QueryType): MusicProvider {
    const typeValue = String(queryType ?? '').toLowerCase()

    if (typeValue.includes('youtube')) return 'youtube'
    if (typeValue.includes('spotify')) return 'spotify'
    if (typeValue.includes('soundcloud')) return 'soundcloud'

    return 'unknown'
}

export function providerFromTrack(track?: {
    source?: string
    url?: string
}): MusicProvider {
    const source = track?.source?.toLowerCase() ?? ''
    const url = track?.url?.toLowerCase() ?? ''

    if (
        source.includes('youtube') ||
        url.includes('youtube') ||
        url.includes('youtu.be')
    ) {
        return 'youtube'
    }
    if (source.includes('spotify') || url.includes('spotify')) {
        return 'spotify'
    }
    if (source.includes('soundcloud') || url.includes('soundcloud')) {
        return 'soundcloud'
    }
    return 'unknown'
}
