import { describe, test, expect } from '@jest/globals'
import { managementSchemas as s } from '../../../src/schemas/management'

/**
 * Contract test for issue #2408: the frontend's `api.commands.*` client
 * (packages/frontend/src/services/api.ts) must send request bodies that
 * validate against these same backend zod schemas, and hit the routes
 * actually registered in packages/backend/src/routes/management.ts
 * (POST /commands, PATCH /commands/:name, DELETE /commands/:name — there is
 * no separate /toggle route, toggle reuses PATCH with { enabled }).
 */
describe('CustomCommands frontend/backend contract', () => {
    describe('POST /commands payload (api.commands.create)', () => {
        test('accepts the exact shape sent by api.commands.create', () => {
            const frontendPayload = {
                name: 'give-role',
                response: 'Here you go!',
                description: 'Gives a role',
            }
            expect(s.createCommandBody.safeParse(frontendPayload).success).toBe(
                true,
            )
        })

        test('accepts a create payload without optional description', () => {
            const frontendPayload = {
                name: 'give-role',
                response: 'Here you go!',
            }
            expect(s.createCommandBody.safeParse(frontendPayload).success).toBe(
                true,
            )
        })

        test('rejects a name with spaces before the frontend ever sends it', () => {
            const invalidPayload = {
                name: 'give role',
                response: 'Here you go!',
            }
            expect(s.createCommandBody.safeParse(invalidPayload).success).toBe(
                false,
            )
        })
    })

    describe('PATCH /commands/:name payload (api.commands.update / api.commands.toggle)', () => {
        test('accepts the exact shape sent by api.commands.update', () => {
            const frontendPayload = {
                response: 'Updated response!',
                description: 'Updated description',
            }
            expect(s.updateCommandBody.safeParse(frontendPayload).success).toBe(
                true,
            )
        })

        test('accepts the exact shape sent by api.commands.toggle', () => {
            const frontendPayload = { enabled: false }
            expect(s.updateCommandBody.safeParse(frontendPayload).success).toBe(
                true,
            )
        })

        test('rejects unknown keys (the body schema is strict)', () => {
            const invalidPayload = { enabled: true, category: 'Fun' }
            expect(s.updateCommandBody.safeParse(invalidPayload).success).toBe(
                false,
            )
        })
    })

    describe('route params (api.commands.update/toggle/delete key by name, not id)', () => {
        test('commandNameParam accepts the {guildId, name} shape the frontend interpolates', () => {
            const frontendParams = {
                guildId: '111111111111111111',
                name: 'give-role',
            }
            expect(s.commandNameParam.safeParse(frontendParams).success).toBe(
                true,
            )
        })
    })
})
