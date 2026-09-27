import { describe, test, expect } from '@jest/globals'
import { moderationSchemas as s } from '../../../src/schemas/moderation'

// Contract test: the moderation cases query params the frontend actually sends
// (packages/frontend/src/pages/Moderation.tsx fetchCases, ~line 302) must be
// accepted by the real backend zod schema (packages/backend/src/schemas/moderation.ts
// casesQuery). This is the pairing that regressed in #2412: the frontend sent
// page/type/search but casesQuery only declared limit, so the extra params were
// silently dropped by validateQuery's stripUnknownFields.
describe('moderationSchemas.casesQuery contract with frontend Moderation.tsx params', () => {
    test('accepts the default params sent on initial load', () => {
        const frontendParams = {
            page: 1,
            limit: 15,
            type: undefined,
            search: undefined,
        }

        const result = s.casesQuery.safeParse(frontendParams)

        expect(result.success).toBe(true)
    })

    test('accepts page, type and search together as sent by the filter bar', () => {
        const frontendParams = {
            page: 2,
            limit: 15,
            type: 'ban',
            search: 'spam',
        }

        const result = s.casesQuery.safeParse(frontendParams)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toEqual(frontendParams)
        }
    })

    test('accepts every type value offered by the frontend type filter dropdown', () => {
        const frontendTypeOptions = [
            'warn',
            'mute',
            'kick',
            'ban',
            'unban',
            'unmute',
        ]

        for (const type of frontendTypeOptions) {
            const result = s.casesQuery.safeParse({ page: 1, limit: 15, type })
            expect(result.success).toBe(true)
        }
    })

    test('rejects a page size beyond the server-side bound', () => {
        const result = s.casesQuery.safeParse({ limit: 100000 })

        expect(result.success).toBe(false)
    })
})
