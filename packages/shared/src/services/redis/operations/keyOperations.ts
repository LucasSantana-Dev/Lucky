/**
 * Redis key operations
 */

import { BaseRedisOperations } from './base'

export class KeyOperations extends BaseRedisOperations {
    async del(key: string): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                const result = await this.client.del(key)
                return result > 0
            },
            false,
            'DEL',
            key,
        )
    }

    async exists(key: string): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                const result = await this.client.exists(key)
                return result === 1
            },
            false,
            'EXISTS',
            key,
        )
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        return this.executeOperation(
            async () => {
                if (!this.client) return false
                const result = await this.client.expire(key, seconds)
                return result === 1
            },
            false,
            'EXPIRE',
            key,
        )
    }

    async keys(pattern: string): Promise<string[]> {
        return this.executeOperation(
            async () => {
                if (!this.client) return []
                return this.client.keys(pattern)
            },
            [],
            'KEYS',
            pattern,
        )
    }

    async ttl(key: string): Promise<number> {
        return this.executeOperation(
            async () => {
                if (!this.client) return -2
                return await this.client.ttl(key)
            },
            -2,
            'TTL',
            key,
        )
    }
}
