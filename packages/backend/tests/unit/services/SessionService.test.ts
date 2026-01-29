import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { sessionService } from '../../../src/services/SessionService'
import { redisClient } from '@lukbot/shared/services'
import {
    MOCK_SESSION_DATA,
    MOCK_SESSION_ID,
    MOCK_EXPIRED_SESSION_DATA,
} from '../../fixtures/mock-data'

jest.mock('@lukbot/shared/services', () => ({
    redisClient: {
        isHealthy: jest.fn(() => true),
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
}))

describe('SessionService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(
            redisClient as jest.Mocked<typeof redisClient>
        ).isHealthy.mockReturnValue(true)
    })

    describe('getSession', () => {
        test('should retrieve session successfully', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.get.mockResolvedValue(JSON.stringify(MOCK_SESSION_DATA))

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toEqual(MOCK_SESSION_DATA)
            expect(mockRedis.get).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should return null when session not found', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.get.mockResolvedValue(null)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })

        test('should return null and delete when session expired', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.get.mockResolvedValue(
                JSON.stringify(MOCK_EXPIRED_SESSION_DATA),
            )
            mockRedis.del.mockResolvedValue(true)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
            expect(mockRedis.del).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should return null when Redis is unavailable', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.isHealthy.mockReturnValue(false)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
            expect(mockRedis.get).not.toHaveBeenCalled()
        })

        test('should return null on JSON parse error', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.get.mockResolvedValue('invalid json')

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })
    })

    describe('setSession', () => {
        test('should store session successfully', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.setex.mockResolvedValue(true)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(mockRedis.setex).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
                7 * 24 * 60 * 60,
                JSON.stringify(MOCK_SESSION_DATA),
            )
        })

        test('should not store when Redis is unavailable', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.isHealthy.mockReturnValue(false)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(mockRedis.setex).not.toHaveBeenCalled()
        })

        test('should throw error on Redis failure', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.setex.mockRejectedValue(new Error('Redis error'))

            await expect(
                sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA),
            ).rejects.toThrow('Redis error')
        })
    })

    describe('deleteSession', () => {
        test('should delete session successfully', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.del.mockResolvedValue(true)

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedis.del).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should not delete when Redis is unavailable', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.isHealthy.mockReturnValue(false)

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedis.del).not.toHaveBeenCalled()
        })

        test('should handle delete errors gracefully', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.del.mockRejectedValue(new Error('Redis error'))

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedis.del).toHaveBeenCalled()
        })
    })

    describe('updateSession', () => {
        test('should update session successfully', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.get.mockResolvedValue(JSON.stringify(MOCK_SESSION_DATA))
            mockRedis.setex.mockResolvedValue(true)

            const updates = { accessToken: 'new_token' }
            await sessionService.updateSession(MOCK_SESSION_ID, updates)

            expect(mockRedis.get).toHaveBeenCalled()
            expect(mockRedis.setex).toHaveBeenCalled()
        })

        test('should throw error when session not found', async () => {
            const mockRedis = redisClient as jest.Mocked<typeof redisClient>
            mockRedis.get.mockResolvedValue(null)

            await expect(
                sessionService.updateSession(MOCK_SESSION_ID, {}),
            ).rejects.toThrow('Session not found')
        })
    })
})
