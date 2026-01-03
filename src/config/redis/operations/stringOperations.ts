/**
 * Redis string operations
 */

import { BaseRedisOperations } from './base'

export class StringOperations extends BaseRedisOperations {
    async get(key: string): Promise<string | null> {
        return this.executeOperation(
            async () => {
                if (!this.client) return null
                return this.client.get(key)
            },
            null,
            'GET',
            key,
        )
    }

    async set(key: string, value: string, ttl?: number): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                if (ttl !== undefined && ttl > 0) {
                    await this.client.setex(key, ttl, value)
                } else {
                    await this.client.set(key, value)
                }
                return true
            },
            false,
            'SET',
            key,
        )
    }

    async setex(key: string, seconds: number, value: string): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                await this.client.setex(key, seconds, value)
                return true
            },
            false,
            'SETEX',
            key,
        )
    }

    async lpush(key: string, ...values: string[]): Promise<number> {
        return this.executeOperation(
            async () => {
                if (!this.client) return 0
                return this.client.lpush(key, ...values)
            },
            0,
            'LPUSH',
            key,
        )
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        return this.executeOperation(
            async () => {
                if (!this.client) return 0
                return this.client.sadd(key, ...members)
            },
            0,
            'SADD',
            key,
        )
    }

    async smembers(key: string): Promise<string[]> {
        return this.executeOperation(
            async () => {
                if (!this.client) return []
                return this.client.smembers(key)
            },
            [],
            'SMEMBERS',
            key,
        )
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.executeOperation(
            async () => {
                if (!this.client) return []
                return this.client.lrange(key, start, stop)
            },
            [],
            'LRANGE',
            key,
        )
    }

    async llen(key: string): Promise<number> {
        return this.executeOperation(
            async () => {
                if (!this.client) return 0
                return this.client.llen(key)
            },
            0,
            'LLEN',
            key,
        )
    }

    async lindex(key: string, index: number): Promise<string | null> {
        return this.executeOperation(
            async () => {
                if (!this.client) return null
                return this.client.lindex(key, index)
            },
            null,
            'LINDEX',
            key,
        )
    }

    async ltrim(key: string, start: number, stop: number): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                await this.client.ltrim(key, start, stop)
                return true
            },
            false,
            'LTRIM',
            key,
        )
    }

    async shutdown(): Promise<void> {
        if (this.client) {
            await this.client.quit()
        }
    }
}
