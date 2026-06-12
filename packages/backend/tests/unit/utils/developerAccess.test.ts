import { afterEach, describe, expect, test } from '@jest/globals'
import { isDeveloperUser } from '../../../src/middleware/requireAdmin'

const originalDeveloperUserIds = process.env.DEVELOPER_USER_IDS

afterEach(() => {
    if (originalDeveloperUserIds === undefined) {
        delete process.env.DEVELOPER_USER_IDS
        return
    }
    process.env.DEVELOPER_USER_IDS = originalDeveloperUserIds
})

describe('isDeveloperUser util', () => {
    test('returns false when user id is missing', () => {
        process.env.DEVELOPER_USER_IDS = 'dev-1,dev-2'

        expect(isDeveloperUser()).toBe(false)
    })

    test('matches developer ids from comma-separated env', () => {
        process.env.DEVELOPER_USER_IDS = 'dev-1, dev-2'

        expect(isDeveloperUser('dev-1')).toBe(true)
        expect(isDeveloperUser('dev-2')).toBe(true)
        expect(isDeveloperUser('user-1')).toBe(false)
    })
})
