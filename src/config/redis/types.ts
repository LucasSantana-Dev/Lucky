/**
 * Redis configuration and type definitions
 */

export type RedisConfig = {
    host: string
    port: number
    password?: string
    db: number
    retryDelayOnFailover: number
    maxRetriesPerRequest: number
    lazyConnect: boolean
}

export type RedisClientState = {
    isConnected: boolean
    reconnectAttempts: number
    maxReconnectAttempts: number
}

export interface IRedisClient {
    connect(): Promise<boolean>
    disconnect(): Promise<void>
    isHealthy(): boolean
    get(key: string): Promise<string | null>
    set(key: string, value: string, ttl?: number): Promise<boolean>
    del(key: string): Promise<boolean>
    exists(key: string): Promise<boolean>
    expire(key: string, seconds: number): Promise<boolean>
    keys(pattern: string): Promise<string[]>
    ttl(key: string): Promise<number>
    setex(key: string, seconds: number, value: string): Promise<boolean>
    lpush(key: string, ...values: string[]): Promise<number>
    sadd(key: string, ...members: string[]): Promise<number>
    smembers(key: string): Promise<string[]>
    lrange(key: string, start: number, stop: number): Promise<string[]>
    llen(key: string): Promise<number>
    lindex(key: string, index: number): Promise<string | null>
    ltrim(key: string, start: number, stop: number): Promise<boolean>
    shutdown(): Promise<void>
}
