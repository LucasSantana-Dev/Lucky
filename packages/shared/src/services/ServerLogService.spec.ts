import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({ serverLog: {} }),
}))

import { serializeServerLog, LOG_LEVEL_BY_TYPE } from './ServerLogService'

describe('serializeServerLog', () => {
    const createdAt = new Date('2026-07-02T16:00:00.000Z')

    it('derives level from type and uses action as the message', () => {
        const result = serializeServerLog({
            id: 'log-1',
            guildId: 'g1',
            type: 'message_delete',
            action: 'Message deleted',
            userId: 'u1',
            channelId: 'c1',
            details: JSON.stringify({ messageId: 'm1', content: 'hi' }),
            createdAt,
        })

        expect(result.level).toBe('moderation')
        expect(result.message).toBe('Message deleted')
        expect(result.type).toBe('message_delete')
        expect(result.createdAt).toBe('2026-07-02T16:00:00.000Z')
        expect(result.metadata).toEqual({ messageId: 'm1', content: 'hi' })
    })

    it('falls back to level "info" for unknown types', () => {
        expect(
            serializeServerLog({
                id: 'x',
                guildId: 'g',
                type: 'totally_unknown_event',
                action: 'Something',
                createdAt,
            }).level,
        ).toBe('info')
    })

    it('parses stringified details and surfaces details.username as userName', () => {
        const result = serializeServerLog({
            id: 'log-2',
            guildId: 'g1',
            type: 'member_join',
            action: 'Member joined',
            userId: 'u9',
            details: JSON.stringify({ username: 'Alice' }),
            createdAt,
        })
        expect(result.userName).toBe('Alice')
        expect(result.level).toBe('info')
    })

    it('falls back to userId when details has no username so actor is never blank', () => {
        const result = serializeServerLog({
            id: 'log-3',
            guildId: 'g1',
            type: 'role_update',
            action: 'Roles updated',
            userId: 'u42',
            details: JSON.stringify({ addedRoles: ['r1'], removedRoles: [] }),
            createdAt,
        })
        expect(result.userName).toBe('u42')
        expect(result.level).toBe('info')
        expect(result.message).toBe('Roles updated')
    })

    it('tolerates already-parsed object details and null details', () => {
        expect(
            serializeServerLog({
                id: 'a',
                guildId: 'g',
                type: 'settings_change',
                action: 'Settings changed',
                details: { setting: 'x' },
                createdAt,
            }).metadata,
        ).toEqual({ setting: 'x' })

        expect(
            serializeServerLog({
                id: 'b',
                guildId: 'g',
                type: 'settings_change',
                action: null,
                details: null,
                createdAt,
            }).message,
        ).toBe('')
    })

    it('maps known types to expected levels', () => {
        expect(LOG_LEVEL_BY_TYPE.automod_trigger).toBe('automod')
        expect(LOG_LEVEL_BY_TYPE.mod_action).toBe('moderation')
        expect(LOG_LEVEL_BY_TYPE.custom_command).toBe('system')
    })
})
