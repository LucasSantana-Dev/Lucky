import { describe, test, expect } from 'vitest'
import { moderationSchemas } from '../../../backend/src/schemas/moderation'
import type { ModerationCaseFilters } from './moderationApi'
import type { ModerationSettingsUpdate } from '@/types'

describe('moderation request-side frontend/backend contract', () => {
    describe('updateReason body', () => {
        test('a non-empty reason is accepted', () => {
            const result = moderationSchemas.updateReasonBody.safeParse({
                reason: 'Breaking server rules',
            })
            expect(result.success).toBe(true)
        })

        test('an empty reason is rejected', () => {
            const result = moderationSchemas.updateReasonBody.safeParse({
                reason: '',
            })
            expect(result.success).toBe(false)
        })
    })

    describe('casesQuery params', () => {
        test('all optional filters the frontend sends are accepted', () => {
            const filters: ModerationCaseFilters = {
                page: 1,
                limit: 25,
                type: 'warn',
                search: 'rule',
            }
            const result = moderationSchemas.casesQuery.safeParse(filters)
            expect(result.success).toBe(true)
        })

        test('empty filters object is accepted', () => {
            const result = moderationSchemas.casesQuery.safeParse({})
            expect(result.success).toBe(true)
        })

        test('page above the backend cap (2000) is rejected', () => {
            const result = moderationSchemas.casesQuery.safeParse({
                page: 2001,
            })
            expect(result.success).toBe(false)
        })
    })

    describe('updateSettings body', () => {
        test('partial settings payload is accepted', () => {
            const update: ModerationSettingsUpdate = {
                autoModEnabled: false,
                maxWarnings: 3,
            }
            const result =
                moderationSchemas.updateSettingsBody.safeParse(update)
            expect(result.success).toBe(true)
        })

        test('empty update is rejected by the backend refine rule', () => {
            const update: ModerationSettingsUpdate = {}
            const result =
                moderationSchemas.updateSettingsBody.safeParse(update)
            expect(result.success).toBe(false)
        })

        test('unknown key in settings payload is rejected (strict schema)', () => {
            const result = moderationSchemas.updateSettingsBody.safeParse({
                autoModEnabled: true,
                unknownKey: 'value',
            })
            expect(result.success).toBe(false)
        })

        test('valid modRoleIds array is accepted', () => {
            const update: ModerationSettingsUpdate = {
                modRoleIds: ['123456789012345678', '987654321098765432'],
            }
            const result =
                moderationSchemas.updateSettingsBody.safeParse(update)
            expect(result.success).toBe(true)
        })
    })

    describe('userCasesQuery params', () => {
        test("activeOnly 'true' string is accepted", () => {
            const result = moderationSchemas.userCasesQuery.safeParse({
                activeOnly: 'true',
            })
            expect(result.success).toBe(true)
        })

        test('empty userCasesQuery is accepted', () => {
            const result = moderationSchemas.userCasesQuery.safeParse({})
            expect(result.success).toBe(true)
        })
    })
})
