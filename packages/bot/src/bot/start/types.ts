/**
 * Bot startup types and interfaces
 */

import type { CustomClient } from '../../types'

export type BotInitializationOptions = {
    skipCommands?: boolean
    skipPlayer?: boolean
    skipEvents?: boolean
}

export type BotInitializationResult = {
    success: boolean
    client?: CustomClient
    error?: string
}

export type BotState = {
    isInitialized: boolean
    isConnected: boolean
    isReady: boolean
    startTime?: number
    uptime?: number
}
