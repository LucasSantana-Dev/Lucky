import { describe, it, expect } from '@jest/globals'
import {
    createAutomationPlan,
    isPlanIdempotent,
} from '@lucky/shared/services/guildAutomation/diff'
import type { GuildAutomationManifestDocument as ManifestType } from '@lucky/shared/services/guildAutomation/types'

function baseManifest(): ManifestType {
    return {
        version: 1,
        guild: {
            id: '123456789012345678',
            name: 'Criativaria',
        },
        roles: {
            roles: [
                {
                    id: '223456789012345678',
                    name: 'Admin',
                    color: 0xff0000,
                },
            ],
            channels: [
                {
                    id: '323456789012345678',
                    name: 'general',
                    type: 'GuildText',
                },
            ],
        },
        source: 'manual',
    }
}

describe('createAutomationPlan', () => {
    it('is idempotent when desired equals actual', () => {
        const desired = baseManifest()
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.operations).toHaveLength(0)
        expect(isPlanIdempotent(plan)).toBe(true)
    })

    it('classifies deletes as protected operations for roles module', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: [],
            },
        }

        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.operations.length).toBeGreaterThan(0)
        expect(plan.protectedOperations.length).toBeGreaterThan(0)
        expect(
            plan.operations.some(
                (operation) =>
                    operation.module === 'roles' &&
                    operation.action === 'delete' &&
                    operation.protected,
            ),
        ).toBe(true)
    })

    it('produces module summary counts', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['323456789012345678'],
                prompts: [],
            },
        }

        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.summary.total).toBe(plan.operations.length)
        expect(plan.summary.byModule.onboarding).toBeGreaterThanOrEqual(1)
    })
})
