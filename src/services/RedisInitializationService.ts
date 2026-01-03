export { RedisInitializationService } from './RedisInitializationService/service'
export type {
    RedisServiceConfig,
    RedisInitializationResult,
    RedisServiceStatus,
} from './RedisInitializationService/types'

// Create and export singleton instance
import { RedisInitializationService } from './RedisInitializationService/service'

export const redisInitializationService = new RedisInitializationService()

// Graceful shutdown handler

process.on('SIGINT', () => {
    void redisInitializationService.shutdown()
})

process.on('SIGTERM', () => {
    void redisInitializationService.shutdown()
})
