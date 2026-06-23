import { describe, expect, test } from 'vitest'
import {
    serializeReactionRolesToJSON,
    deserializeReactionRolesJSON,
} from './reactionRolesExport'
import type { ReactionRoleMessage } from '@/services/reactionRolesApi'

describe('reactionRolesExport', () => {
    const mockMessages: ReactionRoleMessage[] = [
        {
            id: '1',
            guildId: '123456',
            messageId: 'msg-123',
            channelId: '987654321',
            title: 'Developer Roles',
            description: 'Select your tech stack',
            imageUrl: 'https://example.com/image.png',
            createdAt: new Date('2024-01-15').toISOString(),
            mappings: [
                {
                    id: 'map-1',
                    buttonId: '',
                    type: 'button',
                    emoji: '🐍',
                    label: 'Python',
                    style: 'Primary',
                    roleId: '111111111111111111',
                },
                {
                    id: 'map-2',
                    buttonId: '',
                    type: 'button',
                    emoji: '💛',
                    label: 'JavaScript',
                    style: 'Secondary',
                    roleId: '222222222222222222',
                },
            ],
        },
        {
            id: '2',
            guildId: '123456',
            messageId: 'msg-456',
            channelId: '111222333',
            title: 'Hobby Roles',
            description: 'Pick your hobbies',
            imageUrl: undefined,
            createdAt: new Date('2024-02-20').toISOString(),
            mappings: [
                {
                    id: 'map-3',
                    buttonId: '',
                    type: 'button',
                    emoji: null,
                    label: 'Gaming',
                    style: 'Success',
                    roleId: '333333333333333333',
                },
            ],
        },
    ]

    describe('serializeReactionRolesToJSON', () => {
        test('converts messages to importable JSON format', () => {
            const result = serializeReactionRolesToJSON(mockMessages)
            expect(result).toEqual([
                {
                    channelId: '987654321',
                    title: 'Developer Roles',
                    description: 'Select your tech stack',
                    imageUrl: 'https://example.com/image.png',
                    roles: [
                        {
                            roleId: '111111111111111111',
                            label: 'Python',
                            emoji: '🐍',
                            style: 'Primary',
                        },
                        {
                            roleId: '222222222222222222',
                            label: 'JavaScript',
                            emoji: '💛',
                            style: 'Secondary',
                        },
                    ],
                },
                {
                    channelId: '111222333',
                    title: 'Hobby Roles',
                    description: 'Pick your hobbies',
                    roles: [
                        {
                            roleId: '333333333333333333',
                            label: 'Gaming',
                            style: 'Success',
                        },
                    ],
                },
            ])
        })

        test('omits undefined emoji in role entries', () => {
            const result = serializeReactionRolesToJSON(mockMessages)
            expect(result[1].roles[0]).not.toHaveProperty('emoji')
        })

        test('omits undefined imageUrl when not present', () => {
            const result = serializeReactionRolesToJSON(mockMessages)
            expect(result[1]).not.toHaveProperty('imageUrl')
        })

        test('omits messageId, id, and guildId from output', () => {
            const result = serializeReactionRolesToJSON(mockMessages)
            const serialized = JSON.stringify(result)
            expect(serialized).not.toContain('messageId')
            expect(serialized).not.toContain('"id"')
            expect(serialized).not.toContain('guildId')
        })

        test('returns empty array for empty messages', () => {
            expect(serializeReactionRolesToJSON([])).toEqual([])
        })
    })

    describe('deserializeReactionRolesJSON', () => {
        test('validates that input is an array', () => {
            const result = deserializeReactionRolesJSON('{ "not": "array" }')
            expect(result.valid).toBe(false)
            expect(result.errors).toContain('Invalid JSON or not an array')
        })

        test('validates that JSON parses correctly', () => {
            const result = deserializeReactionRolesJSON('{ invalid json }')
            expect(result.valid).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)
        })

        test('validates required fields (channelId, title, description)', () => {
            const json = JSON.stringify([
                {
                    title: 'Missing Channel',
                    description: 'test',
                    roles: [],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('channelId')
        })

        test('validates channelId is numeric snowflake (17-20 digits)', () => {
            const json = JSON.stringify([
                {
                    channelId: 'not-a-number',
                    title: 'Test',
                    description: 'Test',
                    roles: [],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('channelId')
        })

        test('validates title length (1-256)', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: '',
                    description: 'Test',
                    roles: [],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('title')
        })

        test('validates description length (1-4096)', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: '',
                    roles: [],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('description')
        })

        test('validates roles is an array with 1-25 items', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: 'Test',
                    roles: [],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('roles')
        })

        test('validates each role has required fields', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: 'Test',
                    roles: [
                        {
                            label: 'Missing roleId',
                        },
                    ],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('roleId')
        })

        test('validates roleId is numeric snowflake', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: 'Test',
                    roles: [
                        {
                            roleId: 'invalid',
                            label: 'Test Role',
                        },
                    ],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('roleId')
        })

        test('validates role label length (1-80)', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: 'Test',
                    roles: [
                        {
                            roleId: '123456789012345678',
                            label: '',
                        },
                    ],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('label')
        })

        test('validates optional style is in allowed values', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: 'Test',
                    roles: [
                        {
                            roleId: '123456789012345678',
                            label: 'Test Role',
                            style: 'InvalidStyle',
                        },
                    ],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors[0]).toContain('style')
        })

        test('parses valid minimal JSON', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Test',
                    description: 'Test',
                    roles: [
                        {
                            roleId: '123456789012345678',
                            label: 'Test Role',
                        },
                    ],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(true)
            expect(result.data).toHaveLength(1)
            expect(result.data[0].title).toBe('Test')
        })

        test('parses valid JSON with optional fields', () => {
            const json = JSON.stringify([
                {
                    channelId: '123456789012345678',
                    title: 'Developer Roles',
                    description: 'Select your tech',
                    imageUrl: 'https://example.com/image.png',
                    roles: [
                        {
                            roleId: '111111111111111111',
                            label: 'Python',
                            emoji: '🐍',
                            style: 'Primary',
                        },
                        {
                            roleId: '222222222222222222',
                            label: 'JavaScript',
                            emoji: '💛',
                            style: 'Secondary',
                        },
                    ],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(true)
            expect(result.data).toHaveLength(1)
            expect(result.data[0].roles).toHaveLength(2)
            expect(result.data[0].imageUrl).toBe(
                'https://example.com/image.png',
            )
        })

        test('collects multiple errors from different items', () => {
            const json = JSON.stringify([
                {
                    title: 'Missing channel',
                    description: 'Test',
                    roles: [],
                },
                {
                    channelId: '123456789012345678',
                    title: 'Valid',
                    description: 'Test',
                    roles: [{ label: 'Missing roleId' }],
                },
            ])
            const result = deserializeReactionRolesJSON(json)
            expect(result.valid).toBe(false)
            expect(result.errors.length).toBeGreaterThanOrEqual(2)
        })
    })
})
