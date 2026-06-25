import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { requireAdmin, isDeveloperUser } from '../../../src/middleware/requireAdmin'
import {
	createMockRequest,
	createMockResponse,
	createMockNext,
} from '../../fixtures/test-helpers'
import { MOCK_DISCORD_USER } from '../../fixtures/mock-data'

describe('Require Admin Middleware', () => {
	let originalDeveloperUserIds: string | undefined

	beforeEach(() => {
		jest.clearAllMocks()
		originalDeveloperUserIds = process.env.DEVELOPER_USER_IDS
		delete process.env.DEVELOPER_USER_IDS
	})

	afterEach(() => {
		if (originalDeveloperUserIds === undefined) {
			delete process.env.DEVELOPER_USER_IDS
		} else {
			process.env.DEVELOPER_USER_IDS = originalDeveloperUserIds
		}
	})

	describe('isDeveloperUser', () => {
		test('should return true when userId is in DEVELOPER_USER_IDS', () => {
			process.env.DEVELOPER_USER_IDS = '123456789012345678,987654321098765432'

			const result = isDeveloperUser('123456789012345678')

			expect(result).toBe(true)
		})

		test('should return true for any developer ID in the list', () => {
			process.env.DEVELOPER_USER_IDS = '111111111111111111,222222222222222222,333333333333333333'

			const result = isDeveloperUser('222222222222222222')

			expect(result).toBe(true)
		})

		test('should return false when userId is not in DEVELOPER_USER_IDS', () => {
			process.env.DEVELOPER_USER_IDS = '123456789012345678,987654321098765432'

			const result = isDeveloperUser('999999999999999999')

			expect(result).toBe(false)
		})

		test('should return false when DEVELOPER_USER_IDS is empty', () => {
			process.env.DEVELOPER_USER_IDS = ''

			const result = isDeveloperUser('123456789012345678')

			expect(result).toBe(false)
		})

		test('should return false when userId is undefined', () => {
			process.env.DEVELOPER_USER_IDS = '123456789012345678'

			const result = isDeveloperUser(undefined)

			expect(result).toBe(false)
		})

		test('should handle whitespace in DEVELOPER_USER_IDS', () => {
			process.env.DEVELOPER_USER_IDS = ' 123456789012345678 , 987654321098765432 '

			const result1 = isDeveloperUser('123456789012345678')
			const result2 = isDeveloperUser('987654321098765432')

			expect(result1).toBe(true)
			expect(result2).toBe(true)
		})
	})

	describe('requireAdmin', () => {
		test('should call next() when userId is a developer', () => {
			process.env.DEVELOPER_USER_IDS = MOCK_DISCORD_USER.id

			const req = createMockRequest({
				userId: MOCK_DISCORD_USER.id,
			})
			const res = createMockResponse()
			const next = createMockNext()

			requireAdmin(req, res, next)

			expect(next).toHaveBeenCalled()
			expect(res.status).not.toHaveBeenCalled()
		})

		test('should return 401 when userId is missing', () => {
			process.env.DEVELOPER_USER_IDS = MOCK_DISCORD_USER.id

			const req = createMockRequest({
				userId: undefined,
			})
			const res = createMockResponse()
			const next = createMockNext()

			requireAdmin(req, res, next)

			expect(res.status).toHaveBeenCalledWith(401)
			expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' })
			expect(next).not.toHaveBeenCalled()
		})

		test('should return 403 when userId is not a developer', () => {
			process.env.DEVELOPER_USER_IDS = '999999999999999999'

			const req = createMockRequest({
				userId: MOCK_DISCORD_USER.id,
			})
			const res = createMockResponse()
			const next = createMockNext()

			requireAdmin(req, res, next)

			expect(res.status).toHaveBeenCalledWith(403)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Admin access required',
			})
			expect(next).not.toHaveBeenCalled()
		})

		test('should return 403 when DEVELOPER_USER_IDS is not set', () => {
			delete process.env.DEVELOPER_USER_IDS

			const req = createMockRequest({
				userId: MOCK_DISCORD_USER.id,
			})
			const res = createMockResponse()
			const next = createMockNext()

			requireAdmin(req, res, next)

			expect(res.status).toHaveBeenCalledWith(403)
			expect(res.json).toHaveBeenCalledWith({
				error: 'Admin access required',
			})
			expect(next).not.toHaveBeenCalled()
		})

		test('should allow access with multiple developer IDs configured', () => {
			process.env.DEVELOPER_USER_IDS = `111111111111111111,${MOCK_DISCORD_USER.id},333333333333333333`

			const req = createMockRequest({
				userId: MOCK_DISCORD_USER.id,
			})
			const res = createMockResponse()
			const next = createMockNext()

			requireAdmin(req, res, next)

			expect(next).toHaveBeenCalled()
			expect(res.status).not.toHaveBeenCalled()
		})
	})
})
