import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { requireAdmin } from '../../../src/middleware/requireAdmin'
import {
    createMockRequest,
    createMockResponse,
    createMockNext,
} from '../../fixtures/test-helpers'

const mockIsDeveloperUser = jest.fn<(userId?: string) => boolean>()

jest.mock('../../../src/utils/developerAccess', () => ({
    isDeveloperUser: (userId?: string) => mockIsDeveloperUser(userId),
}))

describe('requireAdmin middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('calls next() for a developer user', () => {
        const req = createMockRequest({ userId: 'dev-user-id' } as any)
        const res = createMockResponse()
        const next = createMockNext()
        mockIsDeveloperUser.mockReturnValue(true)

        requireAdmin(req, res, next)

        expect(next).toHaveBeenCalledTimes(1)
        expect(res.status).not.toHaveBeenCalled()
    })

    test('returns 403 for authenticated non-admin user', () => {
        const req = createMockRequest({ userId: 'regular-user-id' } as any)
        const res = createMockResponse()
        const next = createMockNext()
        mockIsDeveloperUser.mockReturnValue(false)

        requireAdmin(req, res, next)

        expect(res.status).toHaveBeenCalledWith(403)
        expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' })
        expect(next).not.toHaveBeenCalled()
    })

    test('returns 401 when userId is missing', () => {
        const req = createMockRequest()
        const res = createMockResponse()
        const next = createMockNext()

        requireAdmin(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' })
        expect(next).not.toHaveBeenCalled()
        expect(mockIsDeveloperUser).not.toHaveBeenCalled()
    })

    test('returns 401 when userId is undefined explicitly', () => {
        const req = createMockRequest({ userId: undefined } as any)
        const res = createMockResponse()
        const next = createMockNext()

        requireAdmin(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(next).not.toHaveBeenCalled()
    })
})
