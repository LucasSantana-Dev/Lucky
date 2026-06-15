import { describe, expect, it, jest } from '@jest/globals'
import { createModerationExecutor } from './moderationExecutor'
import type { ModerationPort } from './moderationExecutor'

type UpdateFn = (
    guildId: string,
    settings: Record<string, unknown>,
) => Promise<unknown>

function makePort(): jest.Mocked<ModerationPort> {
    return {
        updateAutoModSettings: jest.fn<UpdateFn>().mockResolvedValue(undefined),
        updateModerationSettings: jest
            .fn<UpdateFn>()
            .mockResolvedValue(undefined),
    }
}

describe('createModerationExecutor', () => {
    it('applies automod settings', async () => {
        const port = makePort()
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {
            automod: { exemptRoles: ['123'] },
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        expect(port.updateAutoModSettings).toHaveBeenCalledWith('g1', {
            exemptRoles: ['123'],
        })
    })

    it('applies moderationSettings', async () => {
        const port = makePort()
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {
            moderationSettings: { muteRoleId: 'r1' },
        })
        const result = await executor.apply(diff, { guildId: 'g1' })

        expect(result.status).toBe('success')
        expect(port.updateModerationSettings).toHaveBeenCalledWith('g1', {
            muteRoleId: 'r1',
        })
    })

    it('applies both automod and moderationSettings', async () => {
        const port = makePort()
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {
            automod: { exemptRoles: [] },
            moderationSettings: { modRoleIds: ['r2'] },
        })
        const result = await executor.apply(diff, { guildId: 'g2' })

        expect(result.status).toBe('success')
        if (result.status === 'success') {
            expect(result.applied).toEqual(['automod', 'moderationSettings'])
        }
    })

    it('is noop when section is empty', async () => {
        const port = makePort()
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {})
        const result = await executor.apply(diff, { guildId: 'g3' })

        expect(result.status).toBe('success')
        if (result.status === 'success') {
            expect(result.applied).toEqual(['noop'])
        }
        expect(port.updateAutoModSettings).not.toHaveBeenCalled()
        expect(port.updateModerationSettings).not.toHaveBeenCalled()
    })

    it('returns partial when one operation fails and the other succeeds', async () => {
        const port = makePort()
        port.updateAutoModSettings.mockRejectedValue(new Error('discord error'))
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {
            automod: { exemptRoles: ['r1'] },
            moderationSettings: { muteRoleId: 'r2' },
        })
        const result = await executor.apply(diff, { guildId: 'g4' })

        expect(result.status).toBe('partial')
        if (result.status === 'partial') {
            expect(result.applied).toContain('moderationSettings')
        }
    })

    it('returns failed when all operations fail', async () => {
        const port = makePort()
        port.updateAutoModSettings.mockRejectedValue(new Error('automod error'))
        port.updateModerationSettings.mockRejectedValue(
            new Error('moderation error'),
        )
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {
            automod: { exemptRoles: ['r1'] },
            moderationSettings: { muteRoleId: 'r2' },
        })
        const result = await executor.apply(diff, { guildId: 'g5' })

        expect(result.status).toBe('failed')
        if (result.status === 'failed') {
            expect(result.error).toContain('automod error')
        }
    })

    it('capture returns empty object literal (not undefined)', async () => {
        const port = makePort()
        const executor = createModerationExecutor({ port })

        const live = executor.capture()

        // Verify capture returns an object, not undefined
        expect(live).toBeDefined()
        expect(typeof live).toBe('object')
        expect(live).toEqual({})
    })

    it('diff creates noop with proper kind property', async () => {
        const port = makePort()
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {})

        // Verify noop op has kind property set to 'noop'
        expect(diff.ops).toHaveLength(1)
        expect(diff.ops[0]).toHaveProperty('kind')
        expect(diff.ops[0].kind).toBe('noop')
    })

    it('apply formats multiple error messages with semicolon separator', async () => {
        const port = makePort()
        port.updateAutoModSettings.mockRejectedValue(new Error('error1'))
        port.updateModerationSettings.mockRejectedValue(new Error('error2'))
        const executor = createModerationExecutor({ port })

        const live = executor.capture()
        const diff = executor.diff(live, {
            automod: { test: true },
            moderationSettings: { test: true },
        })
        const result = await executor.apply(diff, { guildId: 'g6' })

        expect(result.status).toBe('failed')
        if (result.status === 'failed') {
            // Verify errors are joined with semicolon
            expect(result.error).toContain('; ')
            expect(result.error).toContain('error1')
            expect(result.error).toContain('error2')
        }
    })
})
