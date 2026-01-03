/**
 * Factory pattern for creating services with common configurations
 */

import type { RedisClient } from '../../config/redis'
import type { CustomClient } from '../index'

export interface ServiceFactoryConfig {
    redisClient: RedisClient
    client: CustomClient
}

export abstract class ServiceFactory<T> {
    protected readonly config: ServiceFactoryConfig

    constructor(config: ServiceFactoryConfig) {
        this.config = config
    }

    abstract create(): T

    protected getDefaultConfig() {
        return {
            defaultTtl: 7 * 24 * 60 * 60, // 7 days
            maxSize: 50,
            cleanupInterval: 300000, // 5 minutes
        }
    }

    protected createRedisKey(prefix: string, identifier: string): string {
        return `${prefix}:${identifier}`
    }
}

// Service interfaces
export interface TrackHistoryServiceInterface {
    addTrackToHistory: (track: unknown, guildId: string) => Promise<unknown>
    getTrackHistory: (guildId: string, limit?: number) => Promise<unknown[]>
    clearHistory: (guildId: string) => Promise<void>
}

export interface GuildSettingsServiceInterface {
    getGuildSettings: (guildId: string) => Promise<unknown>
    setGuildSettings: (guildId: string, settings: unknown) => Promise<boolean>
    clearAllAutoplayCounters: () => Promise<boolean>
}

export interface SessionServiceInterface {
    createUserSession: (session: unknown) => Promise<boolean>
    getUserSession: (userId: string, guildId: string) => Promise<unknown>
    deleteUserSession: (userId: string, guildId: string) => Promise<boolean>
}

// Specific factory implementations
export class TrackHistoryServiceFactory extends ServiceFactory<TrackHistoryServiceInterface> {
    create(): TrackHistoryServiceInterface {
        // Implementation would go here
        return {} as TrackHistoryServiceInterface
    }
}

export class GuildSettingsServiceFactory extends ServiceFactory<GuildSettingsServiceInterface> {
    create(): GuildSettingsServiceInterface {
        // Implementation would go here
        return {} as GuildSettingsServiceInterface
    }
}

export class SessionServiceFactory extends ServiceFactory<SessionServiceInterface> {
    create(): SessionServiceInterface {
        // Implementation would go here
        return {} as SessionServiceInterface
    }
}
