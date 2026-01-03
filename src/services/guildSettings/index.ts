import { BaseService } from '../../types/services/BaseService'
import { Result } from '../../types/common/BaseResult'
import { GuildSettingsManager } from './settingsManager'
import { CounterManager } from './counterManager'
import type {
    GuildSettings,
    AutoplayCounter,
    GuildSettingsConfig,
} from './types'

/**
 * Main guild settings service that combines settings and counter management
 */
export class GuildSettingsService extends BaseService<GuildSettingsConfig> {
    private readonly settingsManager: GuildSettingsManager
    private readonly counterManager: CounterManager

    constructor(config: GuildSettingsConfig, redisClient: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(config as any, redisClient as any)

        this.settingsManager = new GuildSettingsManager(config)
        this.counterManager = new CounterManager(config)
    }

    // Settings methods
    async getGuildSettings(guildId: string): Promise<Result<GuildSettings | null>> {
        return this.executeWithFallback(
            async () => {
                const settings = await this.settingsManager.getGuildSettings(guildId)
                return Result.success(settings)
            },
            Result.success(null),
            'getGuildSettings',
        )
    }

    async setGuildSettings(
        guildId: string,
        settings: GuildSettings,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.settingsManager.setGuildSettings(guildId, settings)
                return Result.success(success)
            },
            Result.success(false),
            'setGuildSettings',
        )
    }

    async updateGuildSettings(
        guildId: string,
        updates: Partial<GuildSettings>,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.settingsManager.updateGuildSettings(guildId, updates)
                return Result.success(success)
            },
            Result.success(false),
            'updateGuildSettings',
        )
    }

    async deleteGuildSettings(guildId: string): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.settingsManager.deleteGuildSettings(guildId)
                return Result.success(success)
            },
            Result.success(false),
            'deleteGuildSettings',
        )
    }

    async getDefaultSettings(): Promise<Result<GuildSettings>> {
        return this.executeWithFallback(
            async () => {
                const settings = await this.settingsManager.getDefaultSettings()
                return Result.success(settings)
            },
            Result.failure('Failed to get default settings'),
            'getDefaultSettings',
        )
    }

    // Counter methods
    async getAutoplayCounter(guildId: string): Promise<Result<AutoplayCounter | null>> {
        return this.executeWithFallback(
            async () => {
                const counter = await this.counterManager.getAutoplayCounter(guildId)
                return Result.success(counter)
            },
            Result.success(null),
            'getAutoplayCounter',
        )
    }

    async setAutoplayCounter(
        guildId: string,
        counter: AutoplayCounter,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.counterManager.setAutoplayCounter(guildId, counter)
                return Result.success(success)
            },
            Result.success(false),
            'setAutoplayCounter',
        )
    }

    async incrementAutoplayCounter(guildId: string): Promise<Result<number>> {
        return this.executeWithFallback(
            async () => {
                const count = await this.counterManager.incrementAutoplayCounter(guildId)
                return Result.success(count)
            },
            Result.success(0),
            'incrementAutoplayCounter',
        )
    }

    async resetAutoplayCounter(guildId: string): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.counterManager.resetAutoplayCounter(guildId)
                return Result.success(success)
            },
            Result.success(false),
            'resetAutoplayCounter',
        )
    }

    async getRepeatCount(guildId: string): Promise<Result<number>> {
        return this.executeWithFallback(
            async () => {
                const count = await this.counterManager.getRepeatCount(guildId)
                return Result.success(count)
            },
            Result.success(0),
            'getRepeatCount',
        )
    }

    async setRepeatCount(guildId: string, count: number): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.counterManager.setRepeatCount(guildId, count)
                return Result.success(success)
            },
            Result.success(false),
            'setRepeatCount',
        )
    }

    async incrementRepeatCount(guildId: string): Promise<Result<number>> {
        return this.executeWithFallback(
            async () => {
                const count = await this.counterManager.incrementRepeatCount(guildId)
                return Result.success(count)
            },
            Result.success(0),
            'incrementRepeatCount',
        )
    }

    async resetRepeatCount(guildId: string): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.counterManager.resetRepeatCount(guildId)
                return Result.success(success)
            },
            Result.success(false),
            'resetRepeatCount',
        )
    }

    // Convenience methods
    async clearGuildSessions(guildId: string): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const settingsResult = await this.deleteGuildSettings(guildId)
                const counterResult = await this.resetAutoplayCounter(guildId)
                const repeatResult = await this.resetRepeatCount(guildId)

                const success = settingsResult.isSuccess() &&
                               counterResult.isSuccess() &&
                               repeatResult.isSuccess()

                return Result.success(success)
            },
            Result.success(false),
            'clearGuildSessions',
        )
    }

    protected getRedisKey(identifier: string): string {
        return super.getRedisKey('guild_settings', identifier)
    }

    async clearAllAutoplayCounters(): Promise<Result<boolean>> {
        return this.executeWithFallback(
            async () => {
                const success = await this.counterManager.clearAllAutoplayCounters()
                return Result.success(success)
            },
            Result.success(false),
            'clearAllAutoplayCounters',
        )
    }
}

// Service should be instantiated with proper config and Redis client

export type { GuildSettings, AutoplayCounter, GuildSettingsConfig }
