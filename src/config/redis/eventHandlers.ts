/**
 * Redis event handlers
 */

import type { Redis } from 'ioredis'
import { debugLog, errorLog, infoLog, warnLog } from '../../utils/general/log'
import type { RedisClientState } from './types'

export function setupRedisEventHandlers(
    client: Redis,
    state: RedisClientState,
): void {
    client.on('connect', () => {
        state.isConnected = true
        state.reconnectAttempts = 0
        infoLog({ message: 'Connected to Redis' })
    })

    client.on('ready', () => {
        debugLog({ message: 'Redis client ready' })
    })

    client.on('error', (error) => {
        state.isConnected = false
        errorLog({ message: 'Redis connection error:', error })
    })

    client.on('close', () => {
        state.isConnected = false
        warnLog({ message: 'Redis connection closed' })
    })

    client.on('reconnecting', () => {
        state.reconnectAttempts++
        if (state.reconnectAttempts <= state.maxReconnectAttempts) {
            debugLog({
                message: `Redis reconnecting... (attempt ${state.reconnectAttempts}/${state.maxReconnectAttempts})`,
            })
        } else {
            errorLog({
                message: 'Redis max reconnection attempts reached',
            })
        }
    })

    client.on('end', () => {
        state.isConnected = false
        debugLog({ message: 'Redis connection ended' })
    })
}
