/**
 * Base Redis operations
 */

import type { Redis } from 'ioredis'
import { debugLog, errorLog } from '../../../utils/general/log'
import type { RedisClientState } from '../types'

export abstract class BaseRedisOperations {
    constructor(
        protected client: Redis | null,
        protected state: RedisClientState,
    ) {}

    protected isHealthy(): boolean {
        return this.state.isConnected && this.client !== null
    }

    protected async executeOperation<T>(
        operation: () => Promise<T>,
        fallback: T,
        operationName: string,
        key?: string,
    ): Promise<T> {
        if (!this.isHealthy()) {
            debugLog({
                message: `Redis not available, skipping ${operationName} operation`,
            })
            return fallback
        }

        try {
            if (!this.client) return fallback
            return await operation()
        } catch (error) {
            const keyInfo = key !== undefined ? ` for key ${key}` : ''
            errorLog({
                message: `Redis ${operationName} error${keyInfo}:`,
                error,
            })
            return fallback
        }
    }
}
