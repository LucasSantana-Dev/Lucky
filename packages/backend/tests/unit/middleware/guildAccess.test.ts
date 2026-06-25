import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { requireGuildModuleAccess } from '../../../src/middleware/guildAccess'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import {
    createMockRequest,
    createMockResponse,
    createMockNext,
} from '../../fixtures/test-helpers'
import {
    MOCK_SESSION_DATA,
    MOCK_GUILD_CONTEXT,
    MOCK_SESSION_ID,
} from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        resolveGuildContext: jest.fn(),
        hasAccess: jest.fn(),
    },
}))

describe('Guild Access Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('requireGuildModuleAccess', () => {
        test('should call next() when session valid, guild context resolved, and access granted', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                MOCK_GUILD_CONTEXT,
            )
            mockGuildAccessService.hasAccess.mockReturnValue(true)

            const middleware = requireGuildModuleAccess('overview', 'view')
            await middleware(req, res, next)

            expect(next).toHaveBeenCalledWith()
            expect(req.guildContext).toEqual(MOCK_GUILD_CONTEXT)
            expect(req.userId).toBe(MOCK_SESSION_DATA.userId)
        })

        test('should return 401 when session ID is missing', async () => {
            const req = createMockRequest({
                sessionID: undefined,
                sessionId: undefined,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const middleware = requireGuildModuleAccess('overview', 'view')
            await middleware(req, res, next)

            expect(next).toHaveBeenCalledWith(expect.any(Object))
            const error = (next as jest.Mock).mock.calls[0][0]
            expect(error).toHaveProperty('statusCode', 401)
        })

        test('should return 401 when session is expired/invalid', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const middleware = requireGuildModuleAccess('overview', 'view')
            await middleware(req, res, next)

            expect(next).toHaveBeenCalledWith(expect.any(Object))
            const error = (next as jest.Mock).mock.calls[0][0]
            expect(error).toHaveProperty('statusCode', 401)
        })

        test('should return 403 when no guild context is available (access denied)', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(null)

            const middleware = requireGuildModuleAccess('overview', 'view')
            await middleware(req, res, next)

            expect(next).toHaveBeenCalledWith(expect.any(Object))
            const error = (next as jest.Mock).mock.calls[0][0]
            expect(error).toHaveProperty('statusCode', 403)
        })

        test('should return 403 when user lacks required module access', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                MOCK_GUILD_CONTEXT,
            )
            mockGuildAccessService.hasAccess.mockReturnValue(false)

            const middleware = requireGuildModuleAccess('overview', 'manage')
            await middleware(req, res, next)

            expect(next).toHaveBeenCalledWith(expect.any(Object))
            const error = (next as jest.Mock).mock.calls[0][0]
            expect(error).toHaveProperty('statusCode', 403)
        })

        test('should extract guildId from params.id when params.guildId is missing', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { id: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                MOCK_GUILD_CONTEXT,
            )
            mockGuildAccessService.hasAccess.mockReturnValue(true)

            const middleware = requireGuildModuleAccess('overview', 'view')
            await middleware(req, res, next)

            expect(next).toHaveBeenCalledWith()
            expect(
                mockGuildAccessService.resolveGuildContext,
            ).toHaveBeenCalledWith(MOCK_SESSION_DATA, '111111111111111111')
        })

        test('should auto-resolve mode to "view" for GET requests', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                MOCK_GUILD_CONTEXT,
            )
            mockGuildAccessService.hasAccess.mockReturnValue(true)

            const middleware = requireGuildModuleAccess('overview', 'auto')
            await middleware(req, res, next)

            expect(mockGuildAccessService.hasAccess).toHaveBeenCalledWith(
                MOCK_GUILD_CONTEXT,
                'overview',
                'view',
            )
        })

        test('should auto-resolve mode to "manage" for POST requests', async () => {
            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'POST',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                MOCK_GUILD_CONTEXT,
            )
            mockGuildAccessService.hasAccess.mockReturnValue(true)

            const middleware = requireGuildModuleAccess('overview', 'auto')
            await middleware(req, res, next)

            expect(mockGuildAccessService.hasAccess).toHaveBeenCalledWith(
                MOCK_GUILD_CONTEXT,
                'overview',
                'manage',
            )
        })

        test('should document known staleness window: membership revoked between getSession and resolveGuildContext may transiently grant access', async () => {
            // This test documents the known staleness window where:
            // 1. getSession() is called and returns valid session data
            // 2. User loses guild membership (revoked via Discord)
            // 3. resolveGuildContext() is called and may still return the cached
            //    guild context (due to ≤30s TTL cache in GuildAccessService)
            //
            // This is acceptable per the design rationale in guildAccess.ts:57-68,
            // which explicitly acknowledges the cache and its 30-second TTL.
            //
            // In this test, both calls succeed (as they would during the staleness
            // window), demonstrating the transient grant of access.

            const req = createMockRequest({
                sessionID: MOCK_SESSION_ID,
                sessionId: MOCK_SESSION_ID,
                params: { guildId: '111111111111111111' },
                method: 'GET',
            })
            const res = createMockResponse()
            const next = createMockNext()

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            // Simulate the cache hit during staleness window: resolveGuildContext
            // returns a context even though the user lost membership after
            // getSession() completed.
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(
                MOCK_GUILD_CONTEXT,
            )
            mockGuildAccessService.hasAccess.mockReturnValue(true)

            const middleware = requireGuildModuleAccess('overview', 'view')
            await middleware(req, res, next)

            // The middleware allows the request through (as documented behavior)
            expect(next).toHaveBeenCalledWith()
            expect(req.guildContext).toEqual(MOCK_GUILD_CONTEXT)
            expect(req.userId).toBe(MOCK_SESSION_DATA.userId)

            // Verify both calls were made in sequence (the non-atomic pattern)
            expect(mockSessionService.getSession).toHaveBeenCalledWith(
                MOCK_SESSION_ID,
            )
            expect(
                mockGuildAccessService.resolveGuildContext,
            ).toHaveBeenCalledWith(MOCK_SESSION_DATA, '111111111111111111')
        })
    })
})
