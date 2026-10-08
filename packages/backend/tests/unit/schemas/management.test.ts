import { describe, test, expect } from '@jest/globals'
import { managementSchemas as s } from '../../../src/schemas/management'

describe('Management Schemas', () => {
    describe('autoModSettingsBody', () => {
        test('should accept spam settings', () => {
            const result = s.autoModSettingsBody.safeParse({
                enabled: true,
                spamEnabled: true,
                spamThreshold: 5,
                spamTimeWindow: 10,
            })
            expect(result.success).toBe(true)
        })

        test('should strip removed text-filter fields sent by an old client', () => {
            const result = s.autoModSettingsBody.safeParse({
                spamEnabled: true,
                capsEnabled: true,
                capsThreshold: 70,
                linksEnabled: true,
                allowedDomains: ['example.com'],
                invitesEnabled: true,
                wordsEnabled: true,
                bannedWords: ['spoiler'],
            })
            expect(result.success).toBe(true)
            expect(result.data).toEqual({ spamEnabled: true })
        })
    })

    describe('createReactionRoleBody', () => {
        const validPayload = {
            channelId: '222222222222222222',
            title: 'Test Roles',
            description: 'Test description',
            roles: [
                {
                    roleId: '333333333333333333',
                    label: 'Test Role',
                    emoji: '✅',
                    style: 'Primary',
                },
            ],
        }

        test('should validate a valid payload', () => {
            const result = s.createReactionRoleBody.safeParse(validPayload)
            expect(result.success).toBe(true)
        })

        test('should accept optional emoji and style', () => {
            const payload = {
                channelId: '222222222222222222',
                title: 'Test Roles',
                description: 'Test description',
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'Test Role',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })

        test('should reject invalid channel ID format', () => {
            const payload = {
                ...validPayload,
                channelId: 'invalid-id',
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should reject empty title', () => {
            const payload = {
                ...validPayload,
                title: '',
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should reject title exceeding max length (256)', () => {
            const payload = {
                ...validPayload,
                title: 'a'.repeat(257),
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept title at max length (256)', () => {
            const payload = {
                ...validPayload,
                title: 'a'.repeat(256),
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })

        test('should reject empty description', () => {
            const payload = {
                ...validPayload,
                description: '',
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should reject description exceeding max length (4096)', () => {
            const payload = {
                ...validPayload,
                description: 'a'.repeat(4097),
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept description at max length (4096)', () => {
            const payload = {
                ...validPayload,
                description: 'a'.repeat(4096),
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })

        test('should reject empty roles array', () => {
            const payload = {
                ...validPayload,
                roles: [],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should reject roles array exceeding max length (25)', () => {
            const payload = {
                ...validPayload,
                roles: Array.from({ length: 26 }, (_, i) => ({
                    roleId: `${i}`.padStart(18, '0'),
                    label: `Role ${i}`,
                })),
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept multiple roles', () => {
            const payload = {
                channelId: '222222222222222222',
                title: 'Test Roles',
                description: 'Test description',
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'Role 1',
                    },
                    {
                        roleId: '444444444444444444',
                        label: 'Role 2',
                    },
                    {
                        roleId: '555555555555555555',
                        label: 'Role 3',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })

        test('should reject duplicate role IDs', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'Test Role 1',
                    },
                    {
                        roleId: '333333333333333333',
                        label: 'Test Role 2',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
            if (!result.success) {
                const errors = result.error.flatten().fieldErrors
                expect(errors.roles).toBeDefined()
            }
        })

        test('should reject invalid style value', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'Test Role',
                        style: 'Invalid' as any,
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept all valid style values', () => {
            const styles = ['Primary', 'Secondary', 'Success', 'Danger']
            for (const style of styles) {
                const payload = {
                    ...validPayload,
                    roles: [
                        {
                            roleId: '333333333333333333',
                            label: 'Test Role',
                            style: style as any,
                        },
                    ],
                }
                const result = s.createReactionRoleBody.safeParse(payload)
                expect(result.success).toBe(true)
            }
        })

        test('should reject empty label', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: '',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should reject label exceeding max length (80)', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'a'.repeat(81),
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept label at max length (80)', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'a'.repeat(80),
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })

        test('should reject emoji exceeding max length (100)', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'Test',
                        emoji: 'a'.repeat(101),
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept emoji at max length (100)', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '333333333333333333',
                        label: 'Test',
                        emoji: 'a'.repeat(100),
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })

        test('should reject invalid role ID format', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: 'invalid-id',
                        label: 'Test Role',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should reject role ID with 16 digits (below minimum)', () => {
            const payload = {
                ...validPayload,
                roles: [
                    {
                        roleId: '1234567890123456',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should accept role ID with 17-20 digits', () => {
            const validIds = [
                '12345678901234567', // 17 digits
                '123456789012345678', // 18 digits
                '1234567890123456789', // 19 digits
                '12345678901234567890', // 20 digits
            ]
            for (const roleId of validIds) {
                const payload = {
                    ...validPayload,
                    roles: [
                        {
                            roleId,
                            label: 'Test Role',
                        },
                    ],
                }
                const result = s.createReactionRoleBody.safeParse(payload)
                expect(result.success).toBe(true)
            }
        })

        test('should reject extra fields in payload', () => {
            const payload = {
                ...validPayload,
                extraField: 'should fail',
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(false)
        })

        test('should allow extra fields in role entry (role object not strict)', () => {
            // Note: reactionRoleEntrySchema is not marked as .strict(),
            // so extra fields are allowed in individual role entries
            const payload = {
                ...validPayload,
                roles: [
                    {
                        ...validPayload.roles[0],
                        extraField: 'extra data',
                    },
                ],
            }
            const result = s.createReactionRoleBody.safeParse(payload)
            expect(result.success).toBe(true)
        })
    })

    describe('messageIdParam', () => {
        test('should validate valid message ID params', () => {
            const params = {
                guildId: '111111111111111111',
                messageId: '222222222222222222',
            }
            const result = s.messageIdParam.safeParse(params)
            expect(result.success).toBe(true)
        })

        test('should reject invalid message ID format', () => {
            const params = {
                guildId: '111111111111111111',
                messageId: 'invalid-id',
            }
            const result = s.messageIdParam.safeParse(params)
            expect(result.success).toBe(false)
        })

        test('should accept message ID with exactly 17 digits (minimum)', () => {
            // The regex /^\d{17,20}$/ allows 17-20 digits
            const params = {
                guildId: '111111111111111111',
                messageId: '12345678901234567',
            }
            const result = s.messageIdParam.safeParse(params)
            expect(result.success).toBe(true)
        })

        test('should accept message ID with 17-20 digits', () => {
            const validIds = [
                '12345678901234567', // 17 digits
                '123456789012345678', // 18 digits
                '1234567890123456789', // 19 digits
                '12345678901234567890', // 20 digits
            ]
            for (const messageId of validIds) {
                const params = {
                    guildId: '111111111111111111',
                    messageId,
                }
                const result = s.messageIdParam.safeParse(params)
                expect(result.success).toBe(true)
            }
        })

        test('should validate guild ID from parent schema', () => {
            const params = {
                guildId: 'invalid-guild',
                messageId: '222222222222222222',
            }
            const result = s.messageIdParam.safeParse(params)
            expect(result.success).toBe(false)
        })
    })

    describe('logsSearchQuery (frontend contract, #2413)', () => {
        // Mirrors the exact params shape packages/frontend/src/services/
        // logsApi.ts builds for `search()`, as they arrive over the wire
        // (Express always parses query values as strings). Guards against
        // the frontend and backend drifting on the search contract again.
        function buildFrontendSearchParams(filters: {
            q?: string
            type?: string
            userId?: string
            limit?: number
            offset?: number
        }): Record<string, string> {
            const params: Record<string, string> = {}
            if (filters.q) params.q = filters.q
            if (filters.type) params.type = filters.type
            if (filters.userId) params.userId = filters.userId
            if (filters.limit) params.limit = String(filters.limit)
            if (filters.offset !== undefined) {
                params.offset = String(filters.offset)
            }
            return params
        }

        test('accepts the query sent when the user types a search term', () => {
            const params = buildFrontendSearchParams({
                q: 'kicked',
                limit: 25,
                offset: 0,
            })
            const result = s.logsSearchQuery.safeParse(params)
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data).toEqual({
                    q: 'kicked',
                    limit: 25,
                    offset: 0,
                })
            }
        })

        test('accepts a level filter combined with a search term and a paged offset', () => {
            const params = buildFrontendSearchParams({
                q: 'ban',
                type: 'moderation',
                limit: 25,
                offset: 50,
            })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(true)
        })

        test('accepts a level-only request with no search term', () => {
            const params = buildFrontendSearchParams({
                type: 'automod',
                limit: 25,
                offset: 0,
            })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(true)
        })

        test('rejects a search term over 200 characters', () => {
            const params = buildFrontendSearchParams({ q: 'a'.repeat(201) })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(false)
        })

        test('rejects a whitespace-only search term', () => {
            const params = buildFrontendSearchParams({ q: '   ' })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(false)
        })

        test('accepts a search term at exactly the 200 character limit', () => {
            const params = buildFrontendSearchParams({ q: 'a'.repeat(200) })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(true)
        })

        test('accepts a valid snowflake userId filter', () => {
            const params = buildFrontendSearchParams({
                userId: '333333333333333333',
            })
            const result = s.logsSearchQuery.safeParse(params)
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.userId).toBe('333333333333333333')
            }
        })

        test('rejects a non-snowflake userId', () => {
            const params = buildFrontendSearchParams({ userId: 'not-a-id' })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(false)
        })

        test('rejects a limit over 500', () => {
            const params = buildFrontendSearchParams({ limit: 501 })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(false)
        })

        test('rejects an offset over the 10000 pagination cap', () => {
            const params = buildFrontendSearchParams({ offset: 10001 })
            expect(s.logsSearchQuery.safeParse(params).success).toBe(false)
        })
    })
})
