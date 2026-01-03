/**
 * Redis operations - main operations class
 */

import type Redis from 'ioredis'
import type { RedisClientState } from './types'
import { KeyOperations } from './operations/keyOperations'
import { StringOperations } from './operations/stringOperations'

export class RedisOperations {
    private readonly stringOps: StringOperations
    private readonly keyOps: KeyOperations

    constructor(client: Redis | null, state: RedisClientState) {
        this.stringOps = new StringOperations(client, state)
        this.keyOps = new KeyOperations(client, state)
    }

    // String operations
    async get(key: string): Promise<string | null> {
        return this.stringOps.get(key)
    }

    async set(key: string, value: string, ttl?: number): Promise<boolean> {
        return this.stringOps.set(key, value, ttl)
    }

    // Key operations
    async del(key: string): Promise<boolean> {
        return this.keyOps.del(key)
    }

    async exists(key: string): Promise<boolean> {
        return this.keyOps.exists(key)
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        return this.keyOps.expire(key, seconds)
    }

    async keys(pattern: string): Promise<string[]> {
        return this.keyOps.keys(pattern)
    }

    async ttl(key: string): Promise<number> {
        return this.keyOps.ttl(key)
    }

    // Additional Redis methods
    async setex(key: string, seconds: number, value: string): Promise<boolean> {
        return this.stringOps.setex(key, seconds, value)
    }

    async lpush(key: string, ...values: string[]): Promise<number> {
        return this.stringOps.lpush(key, ...values)
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        return this.stringOps.sadd(key, ...members)
    }

    async smembers(key: string): Promise<string[]> {
        return this.stringOps.smembers(key)
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.stringOps.lrange(key, start, stop)
    }

    async llen(key: string): Promise<number> {
        return this.stringOps.llen(key)
    }

    async lindex(key: string, index: number): Promise<string | null> {
        return this.stringOps.lindex(key, index)
    }

    async ltrim(key: string, start: number, stop: number): Promise<boolean> {
        return this.stringOps.ltrim(key, start, stop)
    }

    async shutdown(): Promise<void> {
        return this.stringOps.shutdown()
    }
}
