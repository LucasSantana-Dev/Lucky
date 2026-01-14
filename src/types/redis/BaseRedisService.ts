/**
 * Base Redis service with common operation patterns
 */

import type { Redis } from 'ioredis'
import { debugLog, errorLog } from '../../utils/general/log'

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

export abstract class BaseRedisService {
    protected readonly config: RedisServiceConfig
    protected readonly client: Redis | null
    protected readonly state: RedisStateInterface

    constructor(
        client: RedisClientInterface,
        state: RedisStateInterface,
        config: RedisServiceConfig,
    ) {
        this.config = config
        this.client = client as unknown as Redis | null
        this.state = state
    }

    protected isHealthy(): boolean {
        return this.state.isConnected && this.client !== null
    }

    protected async executeOperation<T>(
        operation: () => Promise<T>,
        fallback: T,
        operationName: string,
        key?: string,
    ): Promise<T> {
        if (!this.isHealthy()) {
            debugLog({
                message: `Redis not available, skipping ${operationName} operation`,
            })
            return fallback
        }

        try {
            if (!this.client) return fallback
            return await operation()
        } catch (error) {
            const keyInfo = key !== undefined ? ` for key ${key}` : ''
            errorLog({
                message: `Redis ${operationName} error${keyInfo}:`,
                error,
            })
            return fallback
        }
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
