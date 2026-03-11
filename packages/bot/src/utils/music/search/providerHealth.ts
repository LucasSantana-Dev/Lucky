import { QueryType } from 'discord-player'

export type MusicProvider =
    | 'youtube'
    | 'spotify'
    | 'soundcloud'
    | 'deezer'
    | 'unknown'

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
    'deezer',
    'unknown',
]

const DEFAULT_OPTIONS = {
    cooldownMs: 120_000,
    failureThreshold: 3,
    failurePenalty: 0.2,
    successBoost: 0.05,
} satisfies Required<ProviderHealthOptions>

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
    }

    recordSuccess(provider: MusicProvider, now = Date.now()): void {
        const status = this.ensure(provider)

        status.consecutiveFailures = 0
        status.lastSuccessAt = now
        status.cooldownUntil = null
        status.lastError = null
        status.score = Math.min(1, status.score + this.options.successBoost)
    }

    isAvailable(provider: MusicProvider, now = Date.now()): boolean {
        const status = this.ensure(provider)
        if (status.cooldownUntil === null) return true
        return now >= status.cooldownUntil
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
    failureThreshold: 2,
})

export function providerFromQueryType(queryType?: QueryType): MusicProvider {
    const typeValue = String(queryType ?? '').toLowerCase()

    if (typeValue.includes('youtube')) return 'youtube'
    if (typeValue.includes('spotify')) return 'spotify'
    if (typeValue.includes('soundcloud')) return 'soundcloud'
    if (typeValue.includes('deezer')) return 'deezer'

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
    if (source.includes('deezer') || url.includes('deezer')) {
        return 'deezer'
    }
    return 'unknown'
}
