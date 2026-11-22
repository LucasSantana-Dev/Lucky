import { describe, expect, it, jest } from '@jest/globals'
import { checkModerationHierarchy } from './moderationHierarchy'

function member(id: string, position: number) {
    return { id, roles: { highest: { position } } }
}

function guild(ownerId = 'owner', fetched: unknown = null) {
    return {
        ownerId,
        members: {
            fetch: jest.fn(async () => fetched),
        },
    }
}

function interaction(invoker: unknown, g: unknown, userId = 'mod') {
    return { member: invoker, guild: g, user: { id: userId } } as never
}

describe('checkModerationHierarchy', () => {
    it('blocks a moderator acting on a member with a higher role', async () => {
        const g = guild()
        const result = await checkModerationHierarchy(
            interaction(member('mod', 5), g),
            member('admin', 10) as never,
        )
        expect(result).toMatch(/equal or higher role/i)
    })

    it('blocks a moderator acting on a member with the same top role', async () => {
        const g = guild()
        const result = await checkModerationHierarchy(
            interaction(member('mod', 5), g),
            member('peer', 5) as never,
        )
        expect(result).toMatch(/equal or higher role/i)
    })

    it('allows a moderator acting on a member below them', async () => {
        const g = guild()
        const result = await checkModerationHierarchy(
            interaction(member('mod', 5), g),
            member('user', 1) as never,
        )
        expect(result).toBeNull()
    })

    it('never allows acting on the server owner', async () => {
        const g = guild('owner')
        const result = await checkModerationHierarchy(
            interaction(member('mod', 99), g),
            member('owner', 1) as never,
        )
        expect(result).toMatch(/server owner/i)
    })

    it('lets the owner act on anyone', async () => {
        const g = guild('mod')
        const result = await checkModerationHierarchy(
            interaction(member('mod', 1), g),
            member('admin', 10) as never,
        )
        expect(result).toBeNull()
    })

    it('blocks acting on yourself', async () => {
        const g = guild()
        const result = await checkModerationHierarchy(
            interaction(member('mod', 5), g),
            member('mod', 5) as never,
        )
        expect(result).toMatch(/yourself/i)
    })

    it('allows a target who is not in the server (ban by id)', async () => {
        const g = guild()
        const result = await checkModerationHierarchy(
            interaction(member('mod', 5), g),
            null,
        )
        expect(result).toBeNull()
    })

    it('fetches the moderator when the interaction member has no role data', async () => {
        const g = guild('owner', member('mod', 5))
        const result = await checkModerationHierarchy(
            interaction({ roles: ['123'] }, g),
            member('admin', 10) as never,
        )
        expect(g.members.fetch).toHaveBeenCalledWith('mod')
        expect(result).toMatch(/equal or higher role/i)
    })

    it('blocks when the moderator cannot be resolved', async () => {
        const g = guild('owner', null)
        const result = await checkModerationHierarchy(
            interaction(undefined, g),
            member('user', 1) as never,
        )
        expect(result).not.toBeNull()
    })
})
