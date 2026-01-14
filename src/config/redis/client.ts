/**
 * Redis client implementation
 */

import RedisClientClass, { type Redis } from 'ioredis'
import { debugLog, errorLog } from '../../utils/general/log'
import { createRedisConfig } from './config'
import { setupRedisEventHandlers } from './eventHandlers'
import { RedisOperations } from './operations'
import type { RedisClientState, IRedisClient } from './types'

export class RedisClient implements IRedisClient {
    private client: Redis | null = null
    private readonly state: RedisClientState = {
        isConnected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
    }
    private operations: RedisOperations | null = null

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

    // Delegate operations to the operations class
    async get(key: string): Promise<string | null> {
        return this.operations?.get(key) ?? null
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

    async ttl(key: string): Promise<number> {
        return this.operations?.ttl(key) ?? -2
    }

    async shutdown(): Promise<void> {
        return this.operations?.shutdown() ?? Promise.resolve()
    }
}
