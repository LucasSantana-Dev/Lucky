/**
 * Redis configuration setup
 */

import { ENVIRONMENT_CONFIG } from '../../config'
import type { RedisConfig } from './types'

export function createRedisConfig(): RedisConfig {
    return {
        host: ENVIRONMENT_CONFIG.REDIS.HOST,
        port: ENVIRONMENT_CONFIG.REDIS.PORT,
        password: ENVIRONMENT_CONFIG.REDIS.PASSWORD,
        db: ENVIRONMENT_CONFIG.REDIS.DB,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
    }
}
