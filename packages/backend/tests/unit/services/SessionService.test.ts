import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
    MOCK_SESSION_DATA,
    MOCK_SESSION_ID,
    MOCK_EXPIRED_SESSION_DATA,
} from '../../fixtures/mock-data'

const mockRedisClient = {
    isHealthy: jest.fn<any>(() => true),
    get: jest.fn<any>(),
    set: jest.fn<any>(),
    setex: jest.fn<any>(),
    del: jest.fn<any>(),
}

jest.mock('@lukbot/shared/services', () => ({
    redisClient: mockRedisClient,
}))

jest.mock('@lukbot/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

import { sessionService } from '../../../src/services/SessionService'

describe('SessionService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockRedisClient.isHealthy.mockReturnValue(true)
    })

    describe('getSession', () => {
        test('should retrieve session successfully', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_SESSION_DATA),
            )

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toEqual(MOCK_SESSION_DATA)
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should return null when session not found', async () => {
            mockRedisClient.get.mockResolvedValue(null)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })

        test('should return null and delete when session expired', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_EXPIRED_SESSION_DATA),
            )
            mockRedisClient.del.mockResolvedValue(true)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
            expect(mockRedisClient.del).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should return null when Redis is unavailable', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
            expect(mockRedisClient.get).not.toHaveBeenCalled()
        })

        test('should return null on JSON parse error', async () => {
            mockRedisClient.get.mockResolvedValue('invalid json')

            const result = await sessionService.getSession(MOCK_SESSION_ID)

            expect(result).toBeNull()
        })
    })

    describe('setSession', () => {
        test('should store session successfully', async () => {
            mockRedisClient.setex.mockResolvedValue(true)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
                7 * 24 * 60 * 60,
                JSON.stringify(MOCK_SESSION_DATA),
            )
        })

        test('should not store when Redis is unavailable', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)

            await sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA)

            expect(mockRedisClient.setex).not.toHaveBeenCalled()
        })

        test('should throw error on Redis failure', async () => {
            mockRedisClient.setex.mockRejectedValue(new Error('Redis error'))

            await expect(
                sessionService.setSession(MOCK_SESSION_ID, MOCK_SESSION_DATA),
            ).rejects.toThrow('Redis error')
        })
    })

    describe('deleteSession', () => {
        test('should delete session successfully', async () => {
            mockRedisClient.del.mockResolvedValue(true)

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedisClient.del).toHaveBeenCalledWith(
                `webapp:session:${MOCK_SESSION_ID}`,
            )
        })

        test('should not delete when Redis is unavailable', async () => {
            mockRedisClient.isHealthy.mockReturnValue(false)

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedisClient.del).not.toHaveBeenCalled()
        })

        test('should handle delete errors gracefully', async () => {
            mockRedisClient.del.mockRejectedValue(new Error('Redis error'))

            await sessionService.deleteSession(MOCK_SESSION_ID)

            expect(mockRedisClient.del).toHaveBeenCalled()
        })
    })

    describe('updateSession', () => {
        test('should update session successfully', async () => {
            mockRedisClient.get.mockResolvedValue(
                JSON.stringify(MOCK_SESSION_DATA),
            )
            mockRedisClient.setex.mockResolvedValue(true)

            const updates = { accessToken: 'new_token' }
            await sessionService.updateSession(MOCK_SESSION_ID, updates)

            expect(mockRedisClient.get).toHaveBeenCalled()
            expect(mockRedisClient.setex).toHaveBeenCalled()
        })

        test('should throw error when session not found', async () => {
            mockRedisClient.get.mockResolvedValue(null)

            await expect(
                sessionService.updateSession(MOCK_SESSION_ID, {}),
            ).rejects.toThrow('Session not found')
        })
    })
})
