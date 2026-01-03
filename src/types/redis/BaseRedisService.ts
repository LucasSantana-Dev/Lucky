/**
 * Base Redis service with common operation patterns
 */

import { BaseRedisOperations } from '../../config/redis/operations/base'

export interface RedisServiceConfig {
    defaultTtl: number
    keyPrefix: string
}

export interface RedisClientInterface {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<void>
    del: (key: string) => Promise<number>
    exists: (key: string) => Promise<number>
}

export interface RedisStateInterface {
    isConnected: boolean
    lastPing: number
}

export abstract class BaseRedisService extends BaseRedisOperations {
    protected readonly config: RedisServiceConfig

    constructor(
        client: RedisClientInterface,
        state: RedisStateInterface,
        config: RedisServiceConfig,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(client as any, state as any)
        this.config = config
    }

    protected getKey(identifier: string): string {
        return `${this.config.keyPrefix}:${identifier}`
    }

    protected async setWithTtl(
        key: string,
        value: string,
        ttl?: number,
    ): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                const actualTtl = ttl ?? this.config.defaultTtl
                const result = await this.client.setex(key, actualTtl, value)
                return result === 'OK' || result === true
            },
            false,
            'SET_WITH_TTL',
            key,
        )
    }

    protected async getAndParse<T>(key: string): Promise<T | null> {
        return this.executeOperation(
            async () => {
                if (!this.client) return null
                const value = await this.client.get(key)
                return value ? JSON.parse(value) as T : null
            },
            null,
            'GET_AND_PARSE',
            key,
        )
    }

    protected async setAndSerialize(
        key: string,
        value: unknown,
        ttl?: number,
    ): Promise<boolean> {
        return this.setWithTtl(key, JSON.stringify(value), ttl)
    }
}
