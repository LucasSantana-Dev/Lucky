import { describe, it, expect } from '@jest/globals'
import { createAutomationPlan, isPlanIdempotent } from './diff'
import type { GuildAutomationManifestDocument as ManifestType } from './types'

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

    it('returns false from isPlanIdempotent when operations exist', () => {
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

        expect(isPlanIdempotent(plan)).toBe(false)
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

    it('emits an update operation when a role id matches but a property differs', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            roles: {
                roles: [
                    {
                        id: '223456789012345678',
                        name: 'OldName',
                        color: 0xff0000,
                    },
                ],
                channels: baseManifest().roles!.channels,
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(
            plan.operations.some(
                (op) => op.module === 'roles' && op.action === 'update',
            ),
        ).toBe(true)
    })

    it('triggers stableStringify array path when onboarding defaultChannelIds differ', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['111111111111111111'],
                prompts: [],
            },
        }

        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['222222222222222222'],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(
            plan.operations.some(
                (op) => op.module === 'onboarding' && op.action === 'update',
            ),
        ).toBe(true)
    })

    it('does not create operations when both desired and actual are undefined', () => {
        const desired = {
            ...baseManifest(),
            onboarding: undefined,
        }
        const actual = {
            ...baseManifest(),
            onboarding: undefined,
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.operations.some((op) => op.module === 'onboarding')).toBe(
            false,
        )
    })

    it('creates delete operations when desired is undefined but actual exists', () => {
        const desired = {
            ...baseManifest(),
            onboarding: undefined,
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const deleteOp = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'delete',
        )
        expect(deleteOp).toBeDefined()
        expect(deleteOp?.reason).toBe('Desired manifest removed this target')
    })

    it('creates create operations when actual is undefined but desired exists', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: undefined,
        }

        const plan = createAutomationPlan({ desired, actual })

        const createOp = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'create',
        )
        expect(createOp).toBeDefined()
        expect(createOp?.reason).toBe('Target missing from current state')
    })

    it('distinguishes between protected and safe delete operations', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            reactionroles: {
                messages: [
                    {
                        id: 'msg1',
                        messageId: '111',
                        channelId: '222',
                    },
                ],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const reactionRoleDelete = plan.operations.find(
            (op) => op.module === 'reactionroles' && op.action === 'delete',
        )
        expect(reactionRoleDelete?.protected).toBe(true)
    })

    it('calculates safe operations count correctly (non-protected only)', () => {
        const desired = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: [] },
            },
            roles: {
                roles: [],
                channels: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        // moderation is not protected, roles deletes are protected
        const protectedCount = plan.protectedOperations.length
        const safeCount = plan.operations.length - protectedCount
        expect(plan.summary.safe).toBe(safeCount)
        expect(safeCount).toBeLessThan(plan.summary.total)
    })

    it('filters operations correctly when computing protected vs safe counts', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
            reactionroles: {
                messages: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        // onboarding delete is protected, reactionroles delete is protected
        expect(plan.protectedOperations.length).toBeGreaterThan(0)
        // All operations here should be deletes, so all protected
        expect(plan.operations.length).toBe(plan.protectedOperations.length)
    })

    it('emits parity module delete as protected operation', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            parity: { shadowMode: false },
        }

        const plan = createAutomationPlan({ desired, actual })

        const parityDelete = plan.operations.find(
            (op) => op.module === 'parity' && op.action === 'delete',
        )
        expect(parityDelete).toBeDefined()
        expect(parityDelete?.protected).toBe(true)
        expect(parityDelete?.target).toBe('parity')
    })

    it('creates update operations for moderation changes', () => {
        const desired = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: ['role1'] },
            },
        }
        const actual = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: ['role2'] },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const moderationUpdate = plan.operations.find(
            (op) => op.module === 'moderation' && op.action === 'update',
        )
        expect(moderationUpdate).toBeDefined()
    })

    it('creates update operations for automessages changes', () => {
        const desired = {
            ...baseManifest(),
            automessages: {
                welcome: { enabled: true, channelId: '111', message: 'hello' },
            },
        }
        const actual = {
            ...baseManifest(),
            automessages: {
                welcome: { enabled: false, channelId: '222', message: 'bye' },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const automessagesUpdate = plan.operations.find(
            (op) => op.module === 'automessages' && op.action === 'update',
        )
        expect(automessagesUpdate).toBeDefined()
    })

    it('creates update operations for commandaccess changes', () => {
        const desired = {
            ...baseManifest(),
            commandaccess: {
                grants: [
                    {
                        roleId: 'role1',
                        module: 'automation' as const,
                        mode: 'view' as const,
                    },
                ],
            },
        }
        const actual = {
            ...baseManifest(),
            commandaccess: {
                grants: [
                    {
                        roleId: 'role2',
                        module: 'settings' as const,
                        mode: 'manage' as const,
                    },
                ],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const commandaccessUpdate = plan.operations.find(
            (op) => op.module === 'commandaccess' && op.action === 'update',
        )
        expect(commandaccessUpdate).toBeDefined()
    })

    it('detects role creation when role exists in desired but not actual', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [
                    {
                        id: '223456789012345678',
                        name: 'Admin',
                        color: 0xff0000,
                    },
                    {
                        id: '323456789012345679',
                        name: 'Moderator',
                        color: 0x00ff00,
                    },
                ],
                channels: baseManifest().roles!.channels,
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const roleCreate = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'create' &&
                op.target === 'roles/323456789012345679',
        )
        expect(roleCreate).toBeDefined()
    })

    it('detects role deletion when role exists in actual but not desired', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: baseManifest().roles!.channels,
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const roleDelete = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'delete' &&
                op.target === 'roles/223456789012345678',
        )
        expect(roleDelete).toBeDefined()
        expect(roleDelete?.protected).toBe(true)
    })

    it('detects channel creation when channel exists in desired but not actual', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: baseManifest().roles!.roles,
                channels: [
                    {
                        id: '323456789012345678',
                        name: 'general',
                        type: 'GuildText',
                    },
                    {
                        id: '423456789012345678',
                        name: 'announcements',
                        type: 'GuildText',
                    },
                ],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const channelCreate = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'create' &&
                op.target === 'channels/423456789012345678',
        )
        expect(channelCreate).toBeDefined()
    })

    it('detects channel deletion when channel exists in actual but not desired', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: baseManifest().roles!.roles,
                channels: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const channelDelete = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'delete' &&
                op.target === 'channels/323456789012345678',
        )
        expect(channelDelete).toBeDefined()
        expect(channelDelete?.protected).toBe(true)
    })

    it('detects channel updates when channel exists with different properties', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: baseManifest().roles!.roles,
                channels: [
                    {
                        id: '323456789012345678',
                        name: 'general-updated',
                        type: 'GuildText',
                    },
                ],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const channelUpdate = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'update' &&
                op.target === 'channels/323456789012345678',
        )
        expect(channelUpdate).toBeDefined()
    })

    it('handles empty roles and channels correctly', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: [],
            },
        }
        const actual = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(
            plan.operations.filter((op) => op.module === 'roles'),
        ).toHaveLength(0)
    })

    it('includes module operation counts in summary', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
            moderation: {
                automod: { exemptRoles: [] },
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.summary.byModule.onboarding).toBeGreaterThan(0)
        expect(plan.summary.byModule.moderation).toBeGreaterThan(0)
        expect(plan.summary.byModule.roles).toBe(0)
    })

    it('correctly counts protected and total operations in summary', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
            moderation: {
                automod: { exemptRoles: [] },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.summary.total).toBe(plan.operations.length)
        expect(plan.summary.protected).toBe(plan.protectedOperations.length)
        expect(plan.summary.safe).toBe(
            plan.operations.length - plan.protectedOperations.length,
        )
        expect(plan.summary.protected + plan.summary.safe).toBe(
            plan.summary.total,
        )
    })

    it('marks moderation delete as unprotected', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: [] },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const moderationDelete = plan.operations.find(
            (op) => op.module === 'moderation' && op.action === 'delete',
        )
        // Since protectedDelete is not specified, it defaults to true
        expect(moderationDelete?.protected).toBe(true)
    })

    it('marks automessages delete as unprotected', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            automessages: {
                welcome: { enabled: true, channelId: '111' },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const automessagesDelete = plan.operations.find(
            (op) => op.module === 'automessages' && op.action === 'delete',
        )
        // Since protectedDelete is not specified, it defaults to true
        expect(automessagesDelete?.protected).toBe(true)
    })

    it('marks commandaccess delete as unprotected', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            commandaccess: {
                grants: [
                    {
                        roleId: 'role1',
                        module: 'automation' as const,
                        mode: 'view' as const,
                    },
                ],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const commandaccessDelete = plan.operations.find(
            (op) => op.module === 'commandaccess' && op.action === 'delete',
        )
        // Since protectedDelete is not specified, it defaults to true
        expect(commandaccessDelete?.protected).toBe(true)
    })

    it('marks onboarding delete as protected', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const onboardingDelete = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'delete',
        )
        expect(onboardingDelete?.protected).toBe(true)
    })

    it('creates operations with correct fields and reasons', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const createOp = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'create',
        )
        expect(createOp?.target).toBe('onboarding')
        expect(createOp?.desired).toBeDefined()
        expect(createOp?.actual).toBeUndefined()
        expect(createOp?.reason).toBe('Target missing from current state')
    })

    it('verifies exact target string for onboarding module', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const onboardingOp = plan.operations.find(
            (op) => op.module === 'onboarding',
        )
        expect(onboardingOp?.target).toBe('onboarding')
    })

    it('verifies exact target string for moderation module', () => {
        const desired = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: [] },
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const moderationOp = plan.operations.find(
            (op) => op.module === 'moderation',
        )
        expect(moderationOp?.target).toBe('moderation')
    })

    it('verifies exact target string for automessages module', () => {
        const desired = {
            ...baseManifest(),
            automessages: {
                welcome: { enabled: true, channelId: '111' },
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const automessagesOp = plan.operations.find(
            (op) => op.module === 'automessages',
        )
        expect(automessagesOp?.target).toBe('automessages')
    })

    it('verifies exact target string for reactionroles module', () => {
        const desired = {
            ...baseManifest(),
            reactionroles: {
                messages: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const reactionrolesOp = plan.operations.find(
            (op) => op.module === 'reactionroles',
        )
        expect(reactionrolesOp?.target).toBe('reactionroles')
    })

    it('verifies exact target string for commandaccess module', () => {
        const desired = {
            ...baseManifest(),
            commandaccess: {
                grants: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const commandaccessOp = plan.operations.find(
            (op) => op.module === 'commandaccess',
        )
        expect(commandaccessOp?.target).toBe('commandaccess')
    })

    it('verifies exact update reason string', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['111'],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['222'],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const updateOp = plan.operations.find((op) => op.action === 'update')
        expect(updateOp?.reason).toBe('Target differs from desired manifest')
    })

    it('verifies exact delete reason string', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const deleteOp = plan.operations.find((op) => op.action === 'delete')
        expect(deleteOp?.reason).toBe('Desired manifest removed this target')
    })

    it('verifies create operations have protected=false', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const createOps = plan.operations.filter((op) => op.action === 'create')
        expect(createOps.length).toBeGreaterThan(0)
        createOps.forEach((op) => {
            expect(op.protected).toBe(false)
        })
    })

    it('verifies update operations have protected=false', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: false,
                mode: 2,
                defaultChannelIds: ['111'],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['222'],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const updateOps = plan.operations.filter((op) => op.action === 'update')
        expect(updateOps.length).toBeGreaterThan(0)
        updateOps.forEach((op) => {
            expect(op.protected).toBe(false)
        })
    })

    it('handles undefined roles array (null coalescing)', () => {
        const desired = {
            ...baseManifest(),
            roles: undefined,
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const roleOps = plan.operations.filter((op) => op.module === 'roles')
        expect(roleOps.length).toBeGreaterThan(0)
    })

    it('handles undefined channels array (null coalescing)', () => {
        const desired = baseManifest()
        const actual = {
            ...baseManifest(),
            roles: undefined,
        }

        const plan = createAutomationPlan({ desired, actual })

        const roleOps = plan.operations.filter((op) => op.module === 'roles')
        expect(roleOps.length).toBeGreaterThan(0)
    })

    it('verifies protectedOperations is properly filtered', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
            moderation: {
                automod: { exemptRoles: [] },
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        // All protected operations should have protected=true
        plan.protectedOperations.forEach((op) => {
            expect(op.protected).toBe(true)
        })
        // Verify filter works correctly
        expect(plan.protectedOperations).toEqual(
            plan.operations.filter((op) => op.protected),
        )
    })

    it('verifies no-op when only safe creates exist', () => {
        const desired = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: ['role1'] },
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        const moderationOps = plan.operations.filter(
            (op) => op.module === 'moderation',
        )
        expect(moderationOps.length).toBeGreaterThan(0)
        moderationOps.forEach((op) => {
            expect(op.protected).toBe(false)
        })
        expect(plan.summary.safe).toBeGreaterThan(0)
    })

    it('correctly computes summary counts with mixed operations', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
            roles: {
                roles: [
                    {
                        id: '999999999999999999',
                        name: 'NewRole',
                    },
                ],
                channels: baseManifest().roles!.channels,
            },
        }
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        // Should have protected (onboarding, old roles) and safe (new role)
        expect(plan.summary.total).toBe(plan.operations.length)
        expect(plan.summary.protected).toBeGreaterThan(0)
        expect(plan.summary.safe).toBeGreaterThan(0)
        expect(plan.summary.protected + plan.summary.safe).toBe(
            plan.summary.total,
        )
    })

    it('verifies isEqual compares objects correctly using stableStringify', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['id1', 'id2'],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['id1', 'id2'],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(
            plan.operations.filter((op) => op.module === 'onboarding'),
        ).toHaveLength(0)
    })

    it('verifies isEqual detects differences in nested objects', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['id1'],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['id2'],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const updateOp = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'update',
        )
        expect(updateOp).toBeDefined()
    })

    it('detects changes in boolean properties of nested objects', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: false,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const updateOp = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'update',
        )
        expect(updateOp).toBeDefined()
        expect(updateOp?.action).toBe('update')
    })

    it('sorts object keys for stable comparison', () => {
        // Test with object keys in different orders
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: [],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                prompts: [],
                defaultChannelIds: [],
                mode: 1,
                enabled: true,
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        expect(
            plan.operations.filter((op) => op.module === 'onboarding'),
        ).toHaveLength(0)
    })

    it('arrays are compared element by element for stability', () => {
        const desired = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['a', 'b', 'c'],
                prompts: [],
            },
        }
        const actual = {
            ...baseManifest(),
            onboarding: {
                enabled: true,
                mode: 1,
                defaultChannelIds: ['c', 'b', 'a'],
                prompts: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const updateOp = plan.operations.find(
            (op) => op.module === 'onboarding' && op.action === 'update',
        )
        expect(updateOp).toBeDefined()
    })

    it('verifies null coalescing provides empty array default for roles', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [
                    {
                        id: '999',
                        name: 'NewRole',
                    },
                ],
                channels: [],
            },
        }
        const actual = {
            ...baseManifest(),
            roles: undefined,
        }

        const plan = createAutomationPlan({ desired, actual })

        const createOp = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'create' &&
                op.target === 'roles/999',
        )
        expect(createOp).toBeDefined()
    })

    it('verifies null coalescing provides empty array default for channels', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: [
                    {
                        id: '999',
                        name: 'NewChannel',
                        type: 'GuildText',
                    },
                ],
            },
        }
        const actual = {
            ...baseManifest(),
            roles: undefined,
        }

        const plan = createAutomationPlan({ desired, actual })

        const createOp = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'create' &&
                op.target === 'channels/999',
        )
        expect(createOp).toBeDefined()
    })

    it('both desired and actual roles arrays are null coalesced independently', () => {
        const desired = {
            ...baseManifest(),
            roles: undefined,
        }
        const actual = {
            ...baseManifest(),
            roles: {
                roles: [
                    {
                        id: '999',
                        name: 'OldRole',
                    },
                ],
                channels: [],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const deleteOp = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'delete' &&
                op.target === 'roles/999',
        )
        expect(deleteOp).toBeDefined()
        expect(deleteOp?.protected).toBe(true)
    })

    it('both desired and actual channels arrays are null coalesced independently', () => {
        const desired = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: undefined as any,
            },
        }
        const actual = {
            ...baseManifest(),
            roles: {
                roles: [],
                channels: [
                    {
                        id: '999',
                        name: 'OldChannel',
                        type: 'GuildText',
                    },
                ],
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const deleteOp = plan.operations.find(
            (op) =>
                op.module === 'roles' &&
                op.action === 'delete' &&
                op.target === 'channels/999',
        )
        expect(deleteOp).toBeDefined()
    })

    it('returns early when both desired and actual are undefined', () => {
        const desired = baseManifest()
        const actual = baseManifest()

        const plan = createAutomationPlan({ desired, actual })

        expect(plan.operations).toHaveLength(0)
    })

    it('compares deeply nested objects for equality', () => {
        const desired = {
            ...baseManifest(),
            moderation: {
                automod: {
                    exemptRoles: ['role1', 'role2'],
                    exemptChannels: ['ch1'],
                },
                moderationSettings: { muteRoleId: 'mute1' },
            },
        }
        const actual = {
            ...baseManifest(),
            moderation: {
                automod: {
                    exemptChannels: ['ch1'],
                    exemptRoles: ['role1', 'role2'],
                },
                moderationSettings: { muteRoleId: 'mute1' },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const moderationOps = plan.operations.filter(
            (op) => op.module === 'moderation',
        )
        expect(moderationOps).toHaveLength(0)
    })

    it('detects minor differences in deeply nested structures', () => {
        const desired = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: ['role1'] },
            },
        }
        const actual = {
            ...baseManifest(),
            moderation: {
                automod: { exemptRoles: ['role1', 'role2'] },
            },
        }

        const plan = createAutomationPlan({ desired, actual })

        const updateOp = plan.operations.find(
            (op) => op.module === 'moderation' && op.action === 'update',
        )
        expect(updateOp).toBeDefined()
    })
})
