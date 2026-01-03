/**
 * Redis client module - main entry point
 */

export { RedisClient } from './redis/client'
export type { RedisConfig, RedisClientState } from './redis/types'

// Create and export a singleton instance
import { RedisClient } from './redis/client'
import type { IRedisClient } from './redis/types'

const redisClient: IRedisClient = new RedisClient()
export { redisClient }
