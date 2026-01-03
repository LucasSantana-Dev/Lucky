import type { CustomClient } from '../../types'
import type { HealthCheckClient } from './SimplifiedTelemetry'

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export type HealthCheck = {
    name: string
    status: HealthStatus
    message?: string
    timestamp: number
}

export type HealthReport = {
    status: HealthStatus
    checks: HealthCheck[]
    timestamp: number
    uptime: number
}

/**
 * Perform a health check on the Discord client
 * @param client The Discord client
 * @returns Health check result
 */
export function checkDiscordHealth(client: CustomClient): HealthCheck {
    const isReady = client.isReady()
    const wsPing = client.ws.ping

    return {
        name: 'discord_connection',
        status: isReady && wsPing < 1000 ? 'healthy' : 'degraded',
        message: isReady ? `WebSocket ping: ${wsPing}ms` : 'Client not ready',
        timestamp: Date.now(),
    }
}

/**
 * Perform a health check on Redis connection
 * @param client The Discord client
 * @returns Health check result
 */
export async function checkRedisHealth(
    client: CustomClient,
): Promise<HealthCheck> {
    try {
        const start = Date.now()
        if (client.redis) {
            const isHealthy = (client.redis as HealthCheckClient).isHealthy()
            if (!isHealthy) {
                throw new Error('Redis is not healthy')
            }
        }
        const latency = Date.now() - start

        return {
            name: 'redis_connection',
            status: latency < 100 ? 'healthy' : 'degraded',
            message: `Redis ping: ${latency}ms`,
            timestamp: Date.now(),
        }
    } catch (error) {
        return {
            name: 'redis_connection',
            status: 'unhealthy',
            message: `Redis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now(),
        }
    }
}

/**
 * Perform a health check on the music player
 * @param client The Discord client
 * @returns Health check result
 */
export function checkMusicHealth(client: CustomClient): HealthCheck {
    const { player } = client
    const isHealthy = player && typeof player.search === 'function'

    return {
        name: 'music_player',
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy
            ? 'Music player is operational'
            : 'Music player not available',
        timestamp: Date.now(),
    }
}

/**
 * Generate a comprehensive health report
 * @param client The Discord client
 * @returns Complete health report
 */
export async function generateHealthReport(
    client: CustomClient,
): Promise<HealthReport> {
    const checks = [
        checkDiscordHealth(client),
        await checkRedisHealth(client),
        checkMusicHealth(client),
    ]

    const overallStatus = checks.every((check) => check.status === 'healthy')
        ? 'healthy'
        : checks.some((check) => check.status === 'unhealthy')
          ? 'unhealthy'
          : 'degraded'

    return {
        status: overallStatus,
        checks,
        timestamp: Date.now(),
        uptime: process.uptime(),
    }
}
