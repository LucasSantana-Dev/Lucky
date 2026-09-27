import { describe, test, expect } from '@jest/globals'
import {
    isExemptFromPermissionCap,
    isExemptFromHierarchy,
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
        roleDataAvailable: true,
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

describe('isExemptFromPermissionCap', () => {
    test('owner is exempt regardless of permissions', () => {
        expect(
            isExemptFromPermissionCap(
                context({ owner: true, permissions: '0' }),
            ),
        ).toBe(true)
    })

    test('true Administrator bit is exempt', () => {
        expect(
            isExemptFromPermissionCap(context({ permissions: ADMINISTRATOR })),
        ).toBe(true)
    })

    test('MANAGE_GUILD alone is NOT exempt (not real Administrator)', () => {
        expect(
            isExemptFromPermissionCap(context({ permissions: MANAGE_GUILD })),
        ).toBe(false)
    })

    test('non-admin, non-owner is not exempt', () => {
        expect(
            isExemptFromPermissionCap(context({ permissions: KICK_MEMBERS })),
        ).toBe(false)
    })
})

describe('isExemptFromHierarchy', () => {
    test('owner is exempt', () => {
        expect(isExemptFromHierarchy(context({ owner: true }))).toBe(true)
    })

    test('non-owner is not exempt, even with Administrator', () => {
        // On Discord itself, Administrator does not bypass role hierarchy -
        // only the guild owner can touch a role at or above their own
        // highest role. This is deliberately narrower than
        // isExemptFromPermissionCap (#2451 review).
        expect(
            isExemptFromHierarchy(
                context({ owner: false, permissions: ADMINISTRATOR }),
            ),
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

    test('fails closed on a negative requested permissions value', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: KICK_MEMBERS }),
                '-1',
            ),
        ).toThrow(/Invalid permissions value/)
    })

    test('fails closed on a non-numeric requested permissions value', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: KICK_MEMBERS }),
                'not-a-number',
            ),
        ).toThrow(/Invalid permissions value/)
    })

    test('fails closed on a malformed holder permissions value (e.g. corrupt Discord OAuth data)', () => {
        expect(() =>
            assertRequestedPermissionsWithinGrant(
                context({ permissions: 'garbage' }),
                KICK_MEMBERS,
            ),
        ).toThrow(/Invalid permissions value/)
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

    test('blocks a member with no roles from every real role', () => {
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

    test('Administrator does NOT bypass hierarchy when role data is available', () => {
        // Mirrors real Discord behavior: Administrator does not exempt a
        // non-owner from the role-position rule (#2451 review).
        const roles = [
            role({ id: 'mine', position: 3 }),
            role({ id: 'target', position: 5 }),
        ]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ permissions: ADMINISTRATOR, roleIds: ['mine'] }),
                'target',
                roles,
            ),
        ).toThrow(/at or above/)
    })

    test('skips the check when the target role is absent from a non-empty, successfully-fetched list', () => {
        const roles = [role({ id: 'other', position: 3 })]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({ roleIds: [] }),
                'unknown',
                roles,
            ),
        ).not.toThrow()
    })

    test('fails closed when the role list comes back empty (fetch failure vs. genuinely empty guild are indistinguishable)', () => {
        expect(() =>
            assertRoleHierarchyAllowed(context({ roleIds: [] }), 'target', []),
        ).toThrow(/Unable to verify role hierarchy/)
    })

    test('skips the check entirely when role data was never fetched (e.g. a MANAGE_GUILD-only admin)', () => {
        // GuildAccessService never looks up real member roles for a
        // MANAGE_GUILD-holding, non-owner, non-true-Administrator admin
        // (it already grants them full dashboard access another way), so
        // roleIds is always [] for them. Without roleDataAvailable, that
        // would wrongly read as "holds no roles" and block every role.
        const roles = [role({ id: 'target', position: 50 })]
        expect(() =>
            assertRoleHierarchyAllowed(
                context({
                    permissions: MANAGE_GUILD,
                    roleIds: [],
                    roleDataAvailable: false,
                }),
                'target',
                roles,
            ),
        ).not.toThrow()
    })
})
