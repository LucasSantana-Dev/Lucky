export type RedisServiceConfig = {
    maxRetries: number
    retryDelay: number
    timeout: number
}

export type RedisInitializationResult = {
    success: boolean
    services?: string[]
    error?: string
}

export type RedisServiceStatus = {
    name: string
    initialized: boolean
    healthy: boolean
}
