/**
 * Redis client implementation
 */

import RedisClientClass, { type Redis } from 'ioredis'
import { debugLog, errorLog } from '../../utils/general/log'
import { createRedisConfig } from './config'
import { setupRedisEventHandlers } from './eventHandlers'
import { RedisOperations } from './operations.js'
import type { RedisClientState, IRedisClient } from './types'

export class RedisClient implements IRedisClient {
    private client: Redis | null = null
    private readonly state: RedisClientState = {
        isConnected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
    }
    private operations: RedisOperations | null = null
    private hits = 0
    private misses = 0
    private errors = 0

    constructor() {
        this.initializeClient()
    }

    private initializeClient(): void {
        try {
            const config = createRedisConfig()
            this.client = new RedisClientClass(config) as Redis
            this.operations = new RedisOperations(this.client, this.state)
            setupRedisEventHandlers(this.client, this.state)
        } catch (error) {
            errorLog({ message: 'Failed to initialize Redis client:', error })
        }
    }

    async connect(): Promise<boolean> {
        if (!this.client) {
            errorLog({ message: 'Redis client not initialized' })
            return false
        }

        try {
            await this.client.connect()
            return true
        } catch (error) {
            errorLog({ message: 'Failed to connect to Redis:', error })
            return false
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.disconnect()
                this.state.isConnected = false
                debugLog({ message: 'Redis client disconnected' })
            } catch (error) {
                errorLog({
                    message: 'Error disconnecting Redis client:',
                    error,
                })
            }
        }
    }

    isHealthy(): boolean {
        return this.state.isConnected && this.client !== null
    }

    getMetrics() {
        const total = this.hits + this.misses
        return {
            hits: this.hits,
            misses: this.misses,
            errors: this.errors,
            total,
            hitRate: total > 0 ? this.hits / total : 0,
        }
    }

    resetMetrics() {
        this.hits = 0
        this.misses = 0
        this.errors = 0
    }

    async get(key: string): Promise<string | null> {
        const result = await (this.operations?.get(key) ?? null)
        if (result !== null) this.hits++
        else this.misses++
        return result
    }

    async set(key: string, value: string, ttl?: number): Promise<boolean> {
        return this.operations?.set(key, value, ttl) ?? false
    }

    async del(key: string): Promise<boolean> {
        return this.operations?.del(key) ?? false
    }

    async exists(key: string): Promise<boolean> {
        return this.operations?.exists(key) ?? false
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        return this.operations?.expire(key, seconds) ?? false
    }

    async keys(pattern: string): Promise<string[]> {
        return this.operations?.keys(pattern) ?? []
    }

    // Additional Redis methods
    async setex(key: string, seconds: number, value: string): Promise<boolean> {
        return this.operations?.setex(key, seconds, value) ?? false
    }

    async lpush(key: string, ...values: string[]): Promise<number> {
        return this.operations?.lpush(key, ...values) ?? 0
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        return this.operations?.sadd(key, ...members) ?? 0
    }

    async srem(key: string, ...members: string[]): Promise<number> {
        return this.operations?.srem(key, ...members) ?? 0
    }

    async smembers(key: string): Promise<string[]> {
        return this.operations?.smembers(key) ?? []
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.operations?.lrange(key, start, stop) ?? []
    }

    async llen(key: string): Promise<number> {
        return this.operations?.llen(key) ?? 0
    }

    async lindex(key: string, index: number): Promise<string | null> {
        return this.operations?.lindex(key, index) ?? null
    }

    async ltrim(key: string, start: number, stop: number): Promise<boolean> {
        return this.operations?.ltrim(key, start, stop) ?? false
    }

    async setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> {
        if (!this.client) {
            return false
        }

        try {
            const result = await this.client.set(key, value, 'PX', ttlMs, 'NX')
            return result === 'OK'
        } catch (error) {
            errorLog({
                message: 'Failed to set Redis NX PX lock key',
                error,
                data: { key },
            })
            return false
        }
    }

    async delIfValueMatches(
        key: string,
        expectedValue: string,
    ): Promise<boolean> {
        if (!this.client) {
            return false
        }

        const script =
            'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end'

        try {
            const result = await this.client.eval(script, 1, key, expectedValue)
            return result === 1
        } catch (error) {
            errorLog({
                message: 'Failed to release Redis lock key',
                error,
                data: { key },
            })
            return false
        }
    }

    async ttl(key: string): Promise<number> {
        return this.operations?.ttl(key) ?? -2
    }

    async shutdown(): Promise<void> {
        return this.operations?.shutdown() ?? Promise.resolve()
    }
}
