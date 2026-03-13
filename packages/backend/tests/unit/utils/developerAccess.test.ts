import { afterEach, describe, expect, test } from '@jest/globals'
import { AppError } from '../../../src/errors/AppError'
import {
    isDeveloperUser,
    requireDeveloperUser,
} from '../../../src/utils/developerAccess'

const originalDeveloperUserIds = process.env.DEVELOPER_USER_IDS

afterEach(() => {
    if (originalDeveloperUserIds === undefined) {
        delete process.env.DEVELOPER_USER_IDS
        return
    }
    process.env.DEVELOPER_USER_IDS = originalDeveloperUserIds
})

describe('developerAccess utils', () => {
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

    test('throws forbidden error when user is not a developer', () => {
        process.env.DEVELOPER_USER_IDS = 'dev-1'

        expect(() => requireDeveloperUser('user-1')).toThrow(AppError)
        expect(() => requireDeveloperUser('dev-1')).not.toThrow()
    })
})
