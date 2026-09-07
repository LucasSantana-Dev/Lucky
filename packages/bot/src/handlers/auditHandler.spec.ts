const mockCreateLog = jest.fn()
const mockIsEnabled = jest.fn()
const mockIsIgnored = jest.fn()
const mockPostToModLog = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    serverLogService: {
        createLog: (...args: any[]) => mockCreateLog(...args),
    },
    featureToggleService: {
        isEnabled: (...args: any[]) => mockIsEnabled(...args),
    },
    logSettingsService: {
        isIgnored: (...args: any[]) => mockIsIgnored(...args),
    },
}))

jest.mock('../functions/moderation/helpers/modLogPoster.js', () => ({
    postToModLog: (...args: any[]) => mockPostToModLog(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

import { describe, expect, it, beforeEach } from '@jest/globals'
import { Collection, Events } from 'discord.js'
import { handleAuditEvents } from './auditHandler'

function createMockClient() {
    const listeners = new Map<string, (...args: any[]) => Promise<void>>()
    return {
        client: {
            on: (event: string, cb: (...args: any[]) => Promise<void>) => {
                listeners.set(event, cb)
            },
        } as any,
        listeners,
    }
}

describe('auditHandler ignore-list gating', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockIsEnabled.mockResolvedValue(true)
        mockIsIgnored.mockResolvedValue(false)
        mockPostToModLog.mockResolvedValue(undefined)
        mockCreateLog.mockResolvedValue(undefined)
    })

    it('skips logging a deleted message when the channel is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.MessageDelete)?.({
            guild: { id: 'g1', name: 'Guild' },
            author: { bot: false, id: 'u1', tag: 'u#1' },
            channelId: 'c1',
            content: 'hi',
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', {
            channelId: 'c1',
            userId: 'u1',
        })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('logs a deleted message when nothing is ignored', async () => {
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.MessageDelete)?.({
            guild: { id: 'g1', name: 'Guild' },
            author: { bot: false, id: 'u1', tag: 'u#1' },
            channelId: 'c1',
            content: 'hi',
        })

        expect(mockCreateLog).toHaveBeenCalled()
    })

    it('skips logging an edited message when the author is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.MessageUpdate)?.(
            {
                guild: { id: 'g1', name: 'Guild' },
                author: { bot: false, id: 'u1', tag: 'u#1' },
                channelId: 'c1',
                content: 'old',
            },
            {
                guild: { id: 'g1', name: 'Guild' },
                author: { bot: false, id: 'u1', tag: 'u#1' },
                channelId: 'c1',
                content: 'new',
            },
        )

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', {
            channelId: 'c1',
            userId: 'u1',
        })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('skips logging a ban when the banned user is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.GuildBanAdd)?.({
            user: { id: 'u1', username: 'u1', tag: 'u#1' },
            guild: {
                id: 'g1',
                name: 'Guild',
                fetchAuditLogs: jest.fn().mockResolvedValue({
                    entries: { first: () => undefined },
                }),
                client: { user: { id: 'bot1' } },
            },
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', { userId: 'u1' })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('skips logging an unban when the unbanned user is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.GuildBanRemove)?.({
            user: { id: 'u1', username: 'u1', tag: 'u#1' },
            guild: {
                id: 'g1',
                name: 'Guild',
                fetchAuditLogs: jest.fn().mockResolvedValue({
                    entries: { first: () => undefined },
                }),
                client: { user: { id: 'bot1' } },
            },
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', { userId: 'u1' })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('skips logging a channel create when the channel is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.ChannelCreate)?.({
            guild: {
                id: 'g1',
                name: 'Guild',
                fetchAuditLogs: jest.fn().mockResolvedValue({
                    entries: { first: () => undefined },
                }),
            },
            id: 'c1',
            name: 'general',
            type: 0,
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', { channelId: 'c1' })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('skips logging a role delete when the role is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.GuildRoleDelete)?.({
            guild: {
                id: 'g1',
                name: 'Guild',
                fetchAuditLogs: jest.fn().mockResolvedValue({
                    entries: { first: () => undefined },
                }),
            },
            id: 'r1',
            name: 'Mod',
            color: 0,
            permissions: { bitfield: 0n },
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', { roleIds: ['r1'] })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('skips logging a member join when the user is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        await listeners.get(Events.GuildMemberAdd)?.({
            guild: { id: 'g1', name: 'Guild' },
            user: { id: 'u1', tag: 'u#1', createdAt: new Date() },
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', { userId: 'u1' })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })

    it('skips logging a member leave when a held role is ignored', async () => {
        mockIsIgnored.mockResolvedValue(true)
        const { client, listeners } = createMockClient()
        handleAuditEvents(client)

        const rolesCache = new Collection([
            ['everyone', { name: '@everyone', id: 'everyone' }],
            ['r1', { name: 'Mod', id: 'r1' }],
        ]) as any

        await listeners.get(Events.GuildMemberRemove)?.({
            guild: { id: 'g1', name: 'Guild' },
            user: { id: 'u1', tag: 'u#1' },
            roles: { cache: rolesCache },
        })

        expect(mockIsIgnored).toHaveBeenCalledWith('g1', {
            userId: 'u1',
            roleIds: ['r1'],
        })
        expect(mockCreateLog).not.toHaveBeenCalled()
    })
})
