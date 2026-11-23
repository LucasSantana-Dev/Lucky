import { describe, expect, it, jest } from '@jest/globals'

const interactionReplyMock = jest.fn()
jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

import {
    checkModerationHierarchy,
    fetchMemberOrNull,
    refuseIfOutranked,
    checkRoleHierarchy,
    resolveModeratorCeiling,
} from './moderationHierarchy'

function member(id: string, position: number) {
    return { id, roles: { highest: { position } } }
}

function guild(ownerId = 'owner', fetched: unknown = null) {
    return {
        ownerId,
        members: {
            fetch: jest.fn(async (_id?: string) => fetched),
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

    it('blocks when the target has no role data', async () => {
        const g = guild()
        const result = await checkModerationHierarchy(
            interaction(member('mod', 5), g),
            { id: 'user' } as never,
        )
        expect(result).not.toBeNull()
    })

    it('blocks when fetching the moderator fails', async () => {
        const g = {
            ownerId: 'owner',
            members: {
                fetch: jest.fn(async (_id?: string) => {
                    throw new Error('rate limited')
                }),
            },
        }
        const result = await checkModerationHierarchy(
            interaction(undefined, g),
            member('user', 1) as never,
        )
        expect(result).not.toBeNull()
    })
})

describe('fetchMemberOrNull', () => {
    function guildFetching(impl: () => Promise<unknown>) {
        return { members: { fetch: jest.fn(impl) } } as never
    }

    it('returns null when Discord says the member is unknown', async () => {
        const g = guildFetching(async () => {
            throw Object.assign(new Error('Unknown Member'), { code: 10007 })
        })
        await expect(fetchMemberOrNull(g, 'u1')).resolves.toBeNull()
    })

    it('rethrows any other failure so the command aborts', async () => {
        const g = guildFetching(async () => {
            throw Object.assign(new Error('Service unavailable'), { code: 0 })
        })
        await expect(fetchMemberOrNull(g, 'u1')).rejects.toThrow(
            'Service unavailable',
        )
    })
})

describe('refuseIfOutranked', () => {
    it('replies privately and returns true when the moderator is outranked', async () => {
        interactionReplyMock.mockClear()
        const refused = await refuseIfOutranked(
            interaction(member('mod', 5), guild()),
            member('admin', 10) as never,
        )
        expect(refused).toBe(true)
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({ ephemeral: true }),
            }),
        )
    })

    it('returns false and stays silent when the moderator may act', async () => {
        interactionReplyMock.mockClear()
        const refused = await refuseIfOutranked(
            interaction(member('mod', 5), guild()),
            member('user', 1) as never,
        )
        expect(refused).toBe(false)
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })
})

describe('checkRoleHierarchy', () => {
    it('blocks a role above the moderator', async () => {
        const result = await checkRoleHierarchy(
            interaction(member('mod', 5), guild()),
            { position: 10 } as never,
        )
        expect(result).toMatch(/equal to or higher than/i)
    })

    it('blocks a role equal to the moderator top role', async () => {
        const result = await checkRoleHierarchy(
            interaction(member('mod', 5), guild()),
            { position: 5 } as never,
        )
        expect(result).toMatch(/equal to or higher than/i)
    })

    it('allows a role below the moderator', async () => {
        const result = await checkRoleHierarchy(
            interaction(member('mod', 5), guild()),
            { position: 4 } as never,
        )
        expect(result).toBeNull()
    })

    it('lets the guild owner target any role', async () => {
        const result = await checkRoleHierarchy(
            interaction(member('mod', 1), guild('mod')),
            { position: 50 } as never,
        )
        expect(result).toBeNull()
    })

    it('blocks when the moderator cannot be resolved', async () => {
        const result = await checkRoleHierarchy(
            interaction(undefined, guild('owner', null)),
            { position: 1 } as never,
        )
        expect(result).toMatch(/couldn't verify your roles/i)
    })
})

describe('resolveModeratorCeiling', () => {
    it('returns Infinity for the guild owner', async () => {
        const g = guild('mod')
        expect(await resolveModeratorCeiling(g as never, 'mod')).toBe(Infinity)
        expect(g.members.fetch).not.toHaveBeenCalled()
    })

    it('returns the moderator top role position', async () => {
        const g = guild('owner', member('mod', 7))
        expect(await resolveModeratorCeiling(g as never, 'mod')).toBe(7)
        expect(g.members.fetch).toHaveBeenCalledWith('mod')
    })

    it('returns null when the moderator left the guild', async () => {
        const g = guild('owner', null)
        expect(await resolveModeratorCeiling(g as never, 'mod')).toBeNull()
    })

    it('returns null when Discord says the moderator is unknown', async () => {
        const g = {
            ownerId: 'owner',
            members: {
                fetch: jest.fn(async () => {
                    throw Object.assign(new Error('Unknown Member'), {
                        code: 10007,
                    })
                }),
            },
        }
        expect(await resolveModeratorCeiling(g as never, 'mod')).toBeNull()
    })

    it('rethrows other lookup failures', async () => {
        const g = {
            ownerId: 'owner',
            members: {
                fetch: jest.fn(async () => {
                    throw new Error('rate limited')
                }),
            },
        }
        await expect(
            resolveModeratorCeiling(g as never, 'mod'),
        ).rejects.toThrow('rate limited')
    })
})
