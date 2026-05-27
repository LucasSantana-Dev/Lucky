import { describe, expect, it, jest } from '@jest/globals'
import { createReactionRolesExecutor } from './reactionRolesExecutor'
import type { ReactionRolesPort } from './reactionRolesExecutor'

type ListFn = (
    guildId: string,
) => Promise<{ roleId: string; excludedRoleId: string }[]>
type MutateFn = (
    guildId: string,
    roleId: string,
    excludedRoleId: string,
) => Promise<unknown>

function makePort(): jest.Mocked<ReactionRolesPort> {
    return {
        listExclusiveRoles: jest.fn<ListFn>().mockResolvedValue([]),
        removeExclusiveRole: jest.fn<MutateFn>().mockResolvedValue(undefined),
        setExclusiveRole: jest.fn<MutateFn>().mockResolvedValue(undefined),
    }
}

describe('createReactionRolesExecutor', () => {
    it('sets exclusive roles from manifest', async () => {
        const port = makePort()
        const executor = createReactionRolesExecutor({ port })

        const live = await executor.capture({ guildId: 'g1' })
        const diff = executor.diff(live, {
            exclusiveRoles: [{ roleId: 'r1', excludedRoleId: 'r2' }],
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        expect(port.setExclusiveRole).toHaveBeenCalledWith('g1', 'r1', 'r2')
    })

    it('removes exclusive roles not in manifest', async () => {
        const port = makePort()
        port.listExclusiveRoles.mockResolvedValue([
            { roleId: 'r1', excludedRoleId: 'r2' },
            { roleId: 'r3', excludedRoleId: 'r4' },
        ])
        const executor = createReactionRolesExecutor({ port })

        const live = await executor.capture({ guildId: 'g1' })
        const diff = executor.diff(live, {
            exclusiveRoles: [{ roleId: 'r1', excludedRoleId: 'r2' }],
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        expect(port.removeExclusiveRole).toHaveBeenCalledWith('g1', 'r3', 'r4')
        expect(port.removeExclusiveRole).toHaveBeenCalledTimes(1)
    })

    it('skips messages without calling port', async () => {
        const port = makePort()
        const executor = createReactionRolesExecutor({ port })

        const live = await executor.capture({ guildId: 'g1' })
        const diff = executor.diff(live, {
            messages: [{ messageId: 'm1', channelId: 'c1' }],
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        if (result.status === 'success') {
            expect(result.applied).toContain('skip-messages')
        }
        expect(port.setExclusiveRole).not.toHaveBeenCalled()
        expect(port.removeExclusiveRole).not.toHaveBeenCalled()
    })

    it('does not remove live exclusive pairs when exclusiveRoles is omitted', async () => {
        const port = makePort()
        port.listExclusiveRoles.mockResolvedValue([
            { roleId: 'r1', excludedRoleId: 'r2' },
        ])
        const executor = createReactionRolesExecutor({ port })

        const live = await executor.capture({ guildId: 'g1' })
        const diff = executor.diff(live, {
            messages: [{ messageId: 'm1', channelId: 'c1' }],
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        expect(port.removeExclusiveRole).not.toHaveBeenCalled()
        expect(port.setExclusiveRole).not.toHaveBeenCalled()
    })

    it('is noop when section is empty', async () => {
        const port = makePort()
        const executor = createReactionRolesExecutor({ port })

        const live = await executor.capture({ guildId: 'g1' })
        const diff = executor.diff(live, {})
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        if (result.status === 'success') {
            expect(result.applied).toEqual(['noop'])
        }
        expect(port.setExclusiveRole).not.toHaveBeenCalled()
        expect(port.removeExclusiveRole).not.toHaveBeenCalled()
    })

    it('returns partial on single op failure', async () => {
        const port = makePort()
        port.setExclusiveRole.mockRejectedValue(new Error('discord error'))
        port.listExclusiveRoles.mockResolvedValue([
            { roleId: 'r1', excludedRoleId: 'r2' },
        ])
        const executor = createReactionRolesExecutor({ port })

        const live = await executor.capture({ guildId: 'g1' })
        // live has r1:r2; manifest has r3:r4 → removes r1:r2 + sets r3:r4 (fails)
        const diff = executor.diff(live, {
            exclusiveRoles: [{ roleId: 'r3', excludedRoleId: 'r4' }],
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('partial')
        if (result.status === 'partial') {
            expect(result.applied).toContain('remove-exclusive')
        }
    })
})
