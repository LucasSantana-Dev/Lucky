import { describe, test, expect } from '@jest/globals'
import type { Request } from 'express'
import { isRolesManagePath } from '../../../src/routes/rolesManageGuard'

function reqWithPath(path: string): Request {
    return { path } as Request
}

describe('isRolesManagePath', () => {
    test('matches the exact /manage segment', () => {
        expect(isRolesManagePath(reqWithPath('/manage'))).toBe(true)
    })

    test('matches nested /manage/* paths', () => {
        expect(
            isRolesManagePath(reqWithPath('/manage/111111111111111111')),
        ).toBe(true)
        expect(isRolesManagePath(reqWithPath('/manage/bulk-delete'))).toBe(true)
    })

    test('is case-insensitive, matching Express default routing behavior', () => {
        expect(isRolesManagePath(reqWithPath('/MANAGE'))).toBe(true)
        expect(isRolesManagePath(reqWithPath('/Manage/123'))).toBe(true)
    })

    test('does not match a path that only shares the /manage prefix as text', () => {
        expect(isRolesManagePath(reqWithPath('/managerial'))).toBe(false)
        expect(isRolesManagePath(reqWithPath('/manager'))).toBe(false)
    })

    test('does not match unrelated /roles sub-paths', () => {
        expect(isRolesManagePath(reqWithPath('/exclusive'))).toBe(false)
        expect(isRolesManagePath(reqWithPath('/'))).toBe(false)
    })
})
