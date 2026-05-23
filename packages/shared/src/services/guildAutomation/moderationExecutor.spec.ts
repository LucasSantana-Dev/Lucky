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
})
