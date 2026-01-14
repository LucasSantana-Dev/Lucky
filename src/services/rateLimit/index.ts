import { ENVIRONMENT_CONFIG } from '../../config/config'
import { RateLimitManager } from './rateLimitManager'
import type {
    RateLimitConfig,
    RateLimitResult,
    RateLimitRule,
    RateLimitStats,
} from './types'

/**
 * Main rate limit service
 */
export class RateLimitService {
    private readonly rateLimitManager: RateLimitManager
    private readonly rules: Map<string, RateLimitRule>

    constructor() {
        this.rateLimitManager = new RateLimitManager()
        this.rules = new Map()
        this.initializeDefaultRules()
    }

    private initializeDefaultRules(): void {
        // Command rate limiting
        this.addRule({
            name: 'command',
            config: {
                windowMs: ENVIRONMENT_CONFIG.RATE_LIMITS.COMMAND_WINDOW_MS,
                maxRequests:
                    ENVIRONMENT_CONFIG.RATE_LIMITS.COMMAND_MAX_REQUESTS,
                keyPrefix: 'rate_limit:command',
            },
            description: 'Rate limit for commands',
        })

        // Music rate limiting
        this.addRule({
            name: 'music',
            config: {
                windowMs:
                    ENVIRONMENT_CONFIG.RATE_LIMITS.MUSIC_COMMAND_WINDOW_MS,
                maxRequests:
                    ENVIRONMENT_CONFIG.RATE_LIMITS.MUSIC_COMMAND_MAX_REQUESTS,
                keyPrefix: 'rate_limit:music',
            },
            description: 'Rate limit for music commands',
        })

        // Download rate limiting
        this.addRule({
            name: 'download',
            config: {
                windowMs: ENVIRONMENT_CONFIG.RATE_LIMITS.DOWNLOAD_WINDOW_MS,
                maxRequests:
                    ENVIRONMENT_CONFIG.RATE_LIMITS.DOWNLOAD_MAX_REQUESTS,
                keyPrefix: 'rate_limit:download',
            },
            description: 'Rate limit for download commands',
        })
    }

    addRule(rule: RateLimitRule): void {
        this.rules.set(rule.name, rule)
    }

    getRule(name: string): RateLimitRule | undefined {
        return this.rules.get(name)
    }

    async checkRateLimit(
        identifier: string,
        ruleName: string,
    ): Promise<RateLimitResult> {
        const rule = this.getRule(ruleName)
        if (!rule) {
            throw new Error(`Rate limit rule '${ruleName}' not found`)
        }

        return this.rateLimitManager.checkRateLimit(identifier, rule.config)
    }

    async getRateLimitInfo(
        identifier: string,
        ruleName: string,
    ): Promise<RateLimitResult> {
        const rule = this.getRule(ruleName)
        if (!rule) {
            throw new Error(`Rate limit rule '${ruleName}' not found`)
        }

        return this.rateLimitManager.getRateLimitInfo(identifier, rule.config)
    }

    async resetRateLimit(
        identifier: string,
        ruleName: string,
    ): Promise<boolean> {
        const rule = this.getRule(ruleName)
        if (!rule) {
            throw new Error(`Rate limit rule '${ruleName}' not found`)
        }

        return this.rateLimitManager.resetRateLimit(identifier, rule.config)
    }

    async isRateLimited(
        identifier: string,
        ruleName: string,
    ): Promise<boolean> {
        const result = await this.checkRateLimit(identifier, ruleName)
        return !result.allowed
    }

    async getRemainingRequests(
        identifier: string,
        ruleName: string,
    ): Promise<number> {
        const result = await this.getRateLimitInfo(identifier, ruleName)
        return result.remaining
    }

    async getRetryAfter(
        identifier: string,
        ruleName: string,
    ): Promise<number | undefined> {
        const result = await this.getRateLimitInfo(identifier, ruleName)
        return result.retryAfter
    }
}

export const rateLimitService = new RateLimitService()

export type { RateLimitConfig, RateLimitResult, RateLimitRule, RateLimitStats }
