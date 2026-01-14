export { RedisClient } from './client'
export type { RedisConfig, RedisClientState, IRedisClient } from './types'
export { createRedisConfig } from './config'
export { setupRedisEventHandlers } from './eventHandlers'
export { RedisOperations } from './operations.js'

import { RedisClient } from './client'
export const redisClient = new RedisClient()
