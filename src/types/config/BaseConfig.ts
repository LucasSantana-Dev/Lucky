/**
 * Base configuration pattern for services
 */

export interface BaseConfig {
    ttl: number
    maxSize: number
    cleanupInterval: number
}

export abstract class BaseConfigBuilder<T extends BaseConfig> {
    protected config: Partial<T> = {}

    setTtl(ttl: number): this {
        this.config.ttl = ttl
        return this
    }

    setMaxSize(maxSize: number): this {
        this.config.maxSize = maxSize
        return this
    }

    setCleanupInterval(interval: number): this {
        this.config.cleanupInterval = interval
        return this
    }

    abstract build(): T

    protected getDefaults(): Partial<T> {
        return {
            ttl: 7 * 24 * 60 * 60, // 7 days
            maxSize: 50,
            cleanupInterval: 300000, // 5 minutes
        } as Partial<T>
    }
}

// Specific config builders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TrackHistoryConfigBuilder extends BaseConfigBuilder<any> {
    build() {
        return {
            ...this.getDefaults(),
            ...this.config,
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class GuildSettingsConfigBuilder extends BaseConfigBuilder<any> {
    build() {
        return {
            ...this.getDefaults(),
            ...this.config,
        }
    }
}
