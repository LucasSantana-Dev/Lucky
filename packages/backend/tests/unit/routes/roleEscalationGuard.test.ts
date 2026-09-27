import { describe, test, expect } from '@jest/globals'
import {
    isExemptFromRoleCap,
    assertRequestedPermissionsWithinGrant,
    getHighestRolePosition,
    assertRoleHierarchyAllowed,
    type RoleGuardContext,
} from '../../../src/routes/roleEscalationGuard'
import type { GuildRoleManage } from '../../../src/services/RoleService'

const ADMINISTRATOR = '8' // 0x8
const MANAGE_ROLES = '268435456' // 0x10000000
const KICK_MEMBERS = '2' // 0x2
const MANAGE_GUILD = '32' // 0x20, must NOT be treated as exempt on its own

function context(overrides: Partial<RoleGuardContext> = {}): RoleGuardContext {
    return {
        owner: false,
        permissions: '0',
        roleIds: [],
        ...overrides,
    }
}

function role(overrides: Partial<GuildRoleManage> = {}): GuildRoleManage {
    return {
        id: 'role-1',
        name: 'Role',
        color: 0,
        hoist: false,
        mentionable: false,
        permissions: '0',
        position: 1,
        managed: false,
        ...overrides,
    }
}

describe('isExemptFromRoleCap', () => {
    test('owner is exempt regardless of permissions', () => {
        expect(
            isExemptFromRoleCap(context({ owner: true, permissions: '0' })),
        ).toBe(true)
    })

    test('true Administrator bit is exempt', () => {
        expect(
            isExemptFromRoleCap(context({ permissions: ADMINISTRATOR })),
        ).toBe(true)
    })

    test('MANAGE_GUILD alone is NOT exempt (not real Administrator)', () => {
        expect(
            isExemptFromRoleCap(context({ permissions: MANAGE_GUILD })),
        ).toBe(false)
    })

    test('non-admin, non-owner is not exempt', () => {
        expect(
            isExemptFromRoleCap(context({ permissions: KICK_MEMBERS })),
        ).toBe(false)
    })
})

describe('assertRequestedPermissionsWithinGrant', () => {
    test('allows granting a bit the requester holds', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: KICK_MEMBERS }),
                KICK_MEMBERS,
            ),
        ).not.toThrow()
    })

    test('rejects a non-admin granting Administrator they do not hold', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: KICK_MEMBERS }),
                ADMINISTRATOR,
            ),
        ).toThrow(/Cannot grant permissions/)
    })

    test('rejects granting a bit that is only partially held', () => {
        const combined = (
            BigInt(KICK_MEMBERS) | BigInt(MANAGE_ROLES)
        ).toString()
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: KICK_MEMBERS }),
                combined,
            ),
        ).toThrow(/Cannot grant permissions/)
    })

    test('owner can grant Administrator', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ owner: true, permissions: '0' }),
                ADMINISTRATOR,
            ),
        ).not.toThrow()
    })

    test('true Administrator holder can grant Administrator', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: ADMINISTRATOR }),
                ADMINISTRATOR,
            ),
        ).not.toThrow()
    })

    test('is a no-op when no permissions field is requested', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: '0' }),
                undefined,
            ),
        ).not.toThrow()
    })

    test('rejects granting bits when the requester holds none', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: '0' }),
                KICK_MEMBERS,
            ),
        ).toThrow(/Cannot grant permissions/)
    })
})

describe('getHighestRolePosition', () => {
    test('returns 0 when the requester holds no roles', () => {
        expect(getHighestRolePosition([], [role({ position: 5 })])).toBe(0)
    })

    test('returns the max position among held roles', () => {
        const roles = [
            role({ id: 'a', position: 2 }),
            role({ id: 'b', position: 7 }),
            role({ id: 'c', position: 3 }),
        ]
        expect(getHighestRolePosition(['a', 'b'], roles)).toBe(7)
    })

    test('ignores role IDs not present in allRoles', () => {
        const roles = [role({ id: 'a', position: 4 })]
        expect(getHighestRolePosition(['missing', 'a'], roles)).toBe(4)
    })
})

describe('assertRoleHierarchyAllowed', () => {
    test('rejects editing/deleting a role at or above the requester highest role', () => {
        const roles = [
            role({ id: 'mine', position: 3 }),
            role({ id: 'target', position: 5 }),
        ]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ roleIds: ['mine'] }),
                'target',
                roles,
            ),
        ).toThrow(/at or above/)
    })

    test('rejects editing a role at the same position as the requester highest role', () => {
        const roles = [
            role({ id: 'mine', position: 5 }),
            role({ id: 'target', position: 5 }),
        ]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ roleIds: ['mine'] }),
                'target',
                roles,
            ),
        ).toThrow(/at or above/)
    })

    test('allows editing a role strictly below the requester highest role', () => {
        const roles = [
            role({ id: 'mine', position: 5 }),
            role({ id: 'target', position: 2 }),
        ]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ roleIds: ['mine'] }),
                'target',
                roles,
            ),
        ).not.toThrow()
    })

    test('allows a member with no roles to be blocked from every real role', () => {
        const roles = [role({ id: 'target', position: 1 })]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ roleIds: [] }),
                'target',
                roles,
            ),
        ).toThrow(/at or above/)
    })

    test('owner bypasses hierarchy check', () => {
        const roles = [role({ id: 'target', position: 99 })]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ owner: true, roleIds: [] }),
                'target',
                roles,
            ),
        ).not.toThrow()
    })

    test('Administrator bypasses hierarchy check', () => {
        const roles = [role({ id: 'target', position: 99 })]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ permissions: ADMINISTRATOR, roleIds: [] }),
                'target',
                roles,
            ),
        ).not.toThrow()
    })

    test('skips the check when the target role cannot be resolved (data unavailable)', () => {
        expect(() =>
            assertRoleHierarchyAllowed(context({ roleIds: [] }), 'unknown', []),
        ).not.toThrow()
    })
})
