import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { requireAuth, optionalAuth } from '../../../src/middleware/auth'
import { sessionService } from '../../../src/services/SessionService'
import {
    createMockRequest,
    createMockResponse,
    createMockNext,
} from '../../fixtures/test-helpers'
import {
    MOCK_SESSION_DATA,
    MOCK_EXPIRED_SESSION_DATA,
} from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/DiscordOAuthService', () => ({
    discordOAuthService: {
        refreshToken: jest.fn(),
    },
}))

describe('Auth Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('requireAuth', () => {
        test('should pass authenticated request', async () => {
            const req = createMockRequest({ sessionID: 'valid_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            await new Promise<void>((resolve) => {
                requireAuth(req, res, () => {
                    next()
                    resolve()
                })
            })

            expect(next).toHaveBeenCalled()
            expect(req.userId).toBe(MOCK_SESSION_DATA.userId)
            expect(req.user).toEqual({
                id: MOCK_SESSION_DATA.user.id,
                username: MOCK_SESSION_DATA.user.username,
                discriminator: MOCK_SESSION_DATA.user.discriminator,
                avatar: MOCK_SESSION_DATA.user.avatar,
            })
            expect(req.sessionId).toBe('valid_session_id')
        })

        test('should return 401 when session ID is missing', async () => {
            const req = createMockRequest({ sessionID: undefined })
            const res = createMockResponse()
            const next = createMockNext()

            await new Promise<void>((resolve) => {
                requireAuth(req, res, next)
                resolve()
            })

            expect(res.status).toHaveBeenCalledWith(401)
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not authenticated',
            })
            expect(next).not.toHaveBeenCalled()
        })

        test('should return 401 when session is invalid', async () => {
            const req = createMockRequest({ sessionID: 'invalid_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            await new Promise<void>((resolve) => {
                requireAuth(req, res, next)
                resolve()
            })

            expect(res.status).toHaveBeenCalledWith(401)
            expect(res.json).toHaveBeenCalledWith({
                error: 'Session expired or invalid',
            })
            expect(next).not.toHaveBeenCalled()
        })

        test('should return 401 when session is expired', async () => {
            const req = createMockRequest({ sessionID: 'expired_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            await new Promise<void>((resolve) => {
                requireAuth(req, res, next)
                resolve()
            })

            expect(res.status).toHaveBeenCalledWith(401)
            expect(next).not.toHaveBeenCalled()
        })

        test('should return 500 on session service error', async () => {
            const req = createMockRequest({ sessionID: 'error_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockRejectedValue(
                new Error('Service error'),
            )

            await new Promise<void>((resolve) => {
                requireAuth(req, res, next)
                setTimeout(() => {
                    resolve()
                }, 10)
            })

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith({
                error: 'Internal server error',
            })
            expect(next).not.toHaveBeenCalled()
        })
    })

    describe('optionalAuth', () => {
        test('should set user when session exists', async () => {
            const req = createMockRequest({ sessionID: 'valid_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            await new Promise<void>((resolve) => {
                optionalAuth(req, res, () => {
                    next()
                    resolve()
                })
            })

            expect(next).toHaveBeenCalled()
            expect(req.userId).toBe(MOCK_SESSION_DATA.userId)
            expect(req.user).toBeDefined()
        })

        test('should pass through when session ID is missing', async () => {
            const req = createMockRequest({ sessionID: undefined })
            const res = createMockResponse()
            const next = createMockNext()

            await new Promise<void>((resolve) => {
                optionalAuth(req, res, () => {
                    next()
                    resolve()
                })
            })

            expect(next).toHaveBeenCalled()
            expect(req.userId).toBeUndefined()
            expect(req.user).toBeUndefined()
        })

        test('should pass through when session is invalid', async () => {
            const req = createMockRequest({ sessionID: 'invalid_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            await new Promise<void>((resolve) => {
                optionalAuth(req, res, () => {
                    next()
                    resolve()
                })
            })

            expect(next).toHaveBeenCalled()
            expect(req.userId).toBeUndefined()
        })

        test('should pass through on session service error', async () => {
            const req = createMockRequest({ sessionID: 'error_session_id' })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockRejectedValue(
                new Error('Service error'),
            )

            await new Promise<void>((resolve) => {
                optionalAuth(req, res, () => {
                    next()
                    resolve()
                })
            })

            expect(next).toHaveBeenCalled()
            expect(req.userId).toBeUndefined()
        })
    })
})
