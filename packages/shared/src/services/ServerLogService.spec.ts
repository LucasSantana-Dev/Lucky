import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockServerLog: any = {
    findMany: jest.fn(),
    count: jest.fn(),
}

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({ serverLog: mockServerLog }),
}))

import {
    serializeServerLog,
    LOG_LEVEL_BY_TYPE,
    serverLogService,
} from './ServerLogService'

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

    it('treats an empty-string username as absent and falls back to userId', () => {
        const result = serializeServerLog({
            id: 'log-4',
            guildId: 'g1',
            type: 'role_update',
            action: 'Roles updated',
            userId: 'u77',
            details: JSON.stringify({ username: '' }),
            createdAt,
        })
        expect(result.userName).toBe('u77')
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

describe('searchLogs', () => {
    beforeEach(() => {
        mockServerLog.findMany.mockReset()
        mockServerLog.count.mockReset()
    })

    it('filters on the action field, case-insensitively, when q is provided', async () => {
        mockServerLog.findMany.mockResolvedValue([])

        await serverLogService.searchLogs('g1', { q: 'kicked' })

        expect(mockServerLog.findMany).toHaveBeenCalledWith({
            where: {
                guildId: 'g1',
                action: { contains: 'kicked', mode: 'insensitive' },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 100,
            skip: 0,
        })
    })

    it('combines q with type and userId filters', async () => {
        mockServerLog.findMany.mockResolvedValue([])

        await serverLogService.searchLogs('g1', {
            q: 'ban',
            type: 'mod_action',
            userId: 'u1',
        })

        expect(mockServerLog.findMany).toHaveBeenCalledWith({
            where: {
                guildId: 'g1',
                action: { contains: 'ban', mode: 'insensitive' },
                type: 'mod_action',
                userId: 'u1',
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 100,
            skip: 0,
        })
    })

    it('omits the action filter when q is absent', async () => {
        mockServerLog.findMany.mockResolvedValue([])

        await serverLogService.searchLogs('g1', { type: 'mod_action' })

        expect(mockServerLog.findMany).toHaveBeenCalledWith({
            where: { guildId: 'g1', type: 'mod_action' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 100,
            skip: 0,
        })
    })

    it('threads limit and offset through for pagination', async () => {
        mockServerLog.findMany.mockResolvedValue([])

        await serverLogService.searchLogs('g1', { q: 'x' }, 10, 20)

        expect(mockServerLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 10, skip: 20 }),
        )
    })
})

describe('countSearchLogs', () => {
    beforeEach(() => {
        mockServerLog.count.mockReset()
    })

    it('counts logs matching the same filters as searchLogs', async () => {
        mockServerLog.count.mockResolvedValue(3)

        const result = await serverLogService.countSearchLogs('g1', {
            q: 'kicked',
        })

        expect(result).toBe(3)
        expect(mockServerLog.count).toHaveBeenCalledWith({
            where: {
                guildId: 'g1',
                action: { contains: 'kicked', mode: 'insensitive' },
            },
        })
    })
})
