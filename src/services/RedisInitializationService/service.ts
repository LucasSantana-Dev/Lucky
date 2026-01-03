import { redisClient } from '../../config/redis'
import { infoLog, errorLog, debugLog } from '../../utils/general/log'
import type { RedisInitializationResult, RedisServiceStatus } from './types'

/**
 * Redis initialization service
 */
export class RedisInitializationService {
    private isInitialized = false

    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            debugLog({ message: 'Redis services already initialized' })
            return true
        }

        try {
            infoLog({ message: 'Initializing Redis services...' })

            // Connect to Redis
            const connected = (await redisClient.connect()) as boolean
            if (!connected) {
                errorLog({ message: 'Failed to connect to Redis' })
                return false
            }

            // Test Redis connection
            const isHealthy = redisClient.isHealthy()
            if (!isHealthy) {
                errorLog({ message: 'Redis connection is not healthy' })
                return false
            }

            // Initialize services
            const services = await this.initializeServices()
            if (!services.success) {
                errorLog({
                    message: 'Failed to initialize Redis services:',
                    error: services.error,
                })
                return false
            }

            this.isInitialized = true
            infoLog({ message: 'Redis services initialized successfully' })
            return true
        } catch (error) {
            errorLog({ message: 'Redis initialization error:', error })
            return false
        }
    }

    private async initializeServices(): Promise<RedisInitializationResult> {
        const services: string[] = []
        const errors: string[] = []

        try {
            // Services are already initialized as singletons
            services.push('trackHistoryService')
            services.push('guildSettingsService')
            services.push('rateLimitService')
            services.push('sessionService')

            return {
                success: true,
                services,
            }
        } catch (error) {
            errors.push(
                error instanceof Error ? error.message : 'Unknown error',
            )
            return {
                success: false,
                services,
                error: errors.join(', '),
            }
        }
    }

    async getServiceStatus(): Promise<RedisServiceStatus[]> {
        return [
            {
                name: 'trackHistoryService',
                initialized: true,
                healthy: true,
            },
            {
                name: 'guildSettingsService',
                initialized: true,
                healthy: true,
            },
            {
                name: 'rateLimitService',
                initialized: true,
                healthy: true,
            },
            {
                name: 'sessionService',
                initialized: true,
                healthy: true,
            },
        ]
    }

    async shutdown(): Promise<void> {
        try {
            await redisClient.shutdown()
            this.isInitialized = false
            infoLog({ message: 'Redis services shutdown completed' })
        } catch (error) {
            errorLog({ message: 'Redis shutdown error:', error })
        }
    }
}
