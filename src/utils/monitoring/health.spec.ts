import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { checkDiscordHealth, checkRedisHealth, checkMusicHealth, generateHealthReport } from './health'
import type { CustomClient } from '../../types'

describe('Health Monitoring', () => {
    let mockClient: CustomClient

    beforeEach(() => {
        mockClient = {
            isReady: jest.fn().mockReturnValue(true),
            ws: {
                ping: 50
            },
            redis: {
                isHealthy: jest.fn()
            },
            player: {
                search: jest.fn()
            }
        } as any
    })

    describe('checkDiscordHealth', () => {
        it('should return healthy status when client is ready and ping is low', () => {
            const mockClientHealthy = {
                ...mockClient,
                isReady: jest.fn().mockReturnValue(true),
                ws: { ping: 50 }
            } as any

            const result = checkDiscordHealth(mockClientHealthy)

            expect(result.name).toBe('discord_connection')
            expect(result.status).toBe('healthy')
            expect(result.message).toBe('WebSocket ping: 50ms')
            expect(result.timestamp).toBeDefined()
        })

        it('should return degraded status when ping is high', () => {
            const mockClientHighPing = {
                ...mockClient,
                isReady: jest.fn().mockReturnValue(true),
                ws: { ping: 1500 }
            } as any

            const result = checkDiscordHealth(mockClientHighPing)

            expect(result.status).toBe('degraded')
        })

        it('should return degraded status when client is not ready', () => {
            const mockClientNotReady = {
                ...mockClient,
                isReady: jest.fn().mockReturnValue(false)
            } as any

            const result = checkDiscordHealth(mockClientNotReady)

            expect(result.status).toBe('degraded')
            expect(result.message).toBe('Client not ready')
        })
    })

    describe('checkRedisHealth', () => {
        it('should return healthy status when Redis is healthy and fast', async () => {
            mockClient.redis = {
                isHealthy: jest.fn().mockReturnValue(true)
            } as any

            const result = await checkRedisHealth(mockClient)

            expect(result.name).toBe('redis_connection')
            expect(result.status).toBe('healthy')
            expect(result.message).toContain('Redis ping:')
            expect(result.timestamp).toBeDefined()
        })

        it('should return degraded status when Redis is slow', async () => {
            const mockClientSlowRedis = {
                ...mockClient,
                redis: {
                    isHealthy: jest.fn().mockImplementation(() => {
                        // Simulate slow response by adding delay
                        const start = Date.now()
                        while (Date.now() - start < 150) {
                            // Busy wait to simulate slow response
                        }
                        return true
                    })
                }
            } as any

            const result = await checkRedisHealth(mockClientSlowRedis)

            expect(result.status).toBe('degraded')
        })

        it('should return unhealthy status when Redis is not healthy', async () => {
            mockClient.redis = {
                isHealthy: jest.fn().mockReturnValue(false)
            } as any

            const result = await checkRedisHealth(mockClient)

            expect(result.status).toBe('unhealthy')
            expect(result.message).toContain('Redis error:')
        })

        it('should return unhealthy status when Redis throws error', async () => {
            mockClient.redis = {
                isHealthy: jest.fn().mockImplementation(() => {
                    throw new Error('Connection failed')
                })
            } as any

            const result = await checkRedisHealth(mockClient)

            expect(result.status).toBe('unhealthy')
            expect(result.message).toContain('Redis error: Connection failed')
        })
    })

    describe('checkMusicHealth', () => {
        it('should return healthy status when music player is available', () => {
            const result = checkMusicHealth(mockClient)

            expect(result.name).toBe('music_player')
            expect(result.status).toBe('healthy')
            expect(result.message).toBe('Music player is operational')
            expect(result.timestamp).toBeDefined()
        })

        it('should return unhealthy status when music player is not available', () => {
            const mockClientNoPlayer = {
                ...mockClient,
                player: null
            } as any

            const result = checkMusicHealth(mockClientNoPlayer)

            expect(result.status).toBe('unhealthy')
            expect(result.message).toBe('Music player not available')
        })

        it('should return unhealthy status when music player has no search function', () => {
            const mockClientBadPlayer = {
                ...mockClient,
                player: {} as any
            } as any

            const result = checkMusicHealth(mockClientBadPlayer)

            expect(result.status).toBe('unhealthy')
            expect(result.message).toBe('Music player not available')
        })
    })

    describe('generateHealthReport', () => {
        it('should generate healthy report when all checks pass', async () => {
            const mockClientHealthy = {
                ...mockClient,
                isReady: jest.fn().mockReturnValue(true),
                ws: { ping: 50 },
                redis: {
                    isHealthy: jest.fn().mockReturnValue(true)
                }
            } as any

            const result = await generateHealthReport(mockClientHealthy)

            expect(result.status).toBe('healthy')
            expect(result.checks).toHaveLength(3)
            expect(result.timestamp).toBeDefined()
            expect(result.uptime).toBeDefined()
        })

        it('should generate degraded report when some checks are degraded', async () => {
            const mockClientDegraded = {
                ...mockClient,
                isReady: jest.fn().mockReturnValue(true),
                ws: { ping: 1500 }, // High ping
                redis: {
                    isHealthy: jest.fn().mockReturnValue(true)
                }
            } as any

            const result = await generateHealthReport(mockClientDegraded)

            expect(result.status).toBe('degraded')
        })

        it('should generate unhealthy report when some checks are unhealthy', async () => {
            const mockClientUnhealthy = {
                ...mockClient,
                isReady: jest.fn().mockReturnValue(true),
                ws: { ping: 50 },
                redis: {
                    isHealthy: jest.fn().mockReturnValue(false)
                }
            } as any

            const result = await generateHealthReport(mockClientUnhealthy)

            expect(result.status).toBe('unhealthy')
        })
    })
})
