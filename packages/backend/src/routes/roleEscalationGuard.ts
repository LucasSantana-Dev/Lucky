import { AppError } from '../errors/AppError'
import type { GuildRoleManage } from '../services/RoleService'

const ADMINISTRATOR_BIT = BigInt(0x8)
const MANAGE_ROLES_BIT = BigInt(0x10000000)

/**
 * The subset of GuildAccessContext this guard needs. Kept narrow (rather
 * than importing the full GuildAccessContext type) so it is trivial to
 * construct in tests.
 */
export interface RoleGuardContext {
    owner: boolean
    /** Raw Discord permissions bitfield the requester holds in the guild. */
    permissions: string
    /** Discord role IDs the requester holds in the guild. */
    roleIds: string[]
    /**
     * False when GuildAccessService never fetched this requester's real
     * guild member (it short-circuits that lookup for guild owners and for
     * the dashboard's broader MANAGE_GUILD-inclusive `isAdmin`, since those
     * callers already get full dashboard access). When false, `roleIds` is
     * always `[]` but that does NOT mean the requester actually holds no
     * Discord roles - it means we never checked. Treating it as "no roles"
     * would wrongly block a MANAGE_GUILD-holding admin from every real role.
     * Mirrors GuildAccessContext.botPresenceChecked.
     */
    roleDataAvailable: boolean
}

/**
 * Parses a permissions bitfield that must already be present (never the
 * "no value supplied" case - callers handle that separately). Fails closed:
 * throws on anything that isn't a valid non-negative integer string, rather
 * than silently treating malformed input as zero permissions, which could
 * let a bad "requested" value slip through as trivially satisfied (#2451
 * review).
 */
function parsePermissionBits(value: string): bigint {
    let bits: bigint
    try {
        bits = BigInt(value)
    } catch {
        throw AppError.forbidden('Invalid permissions value')
    }
    if (bits < BigInt(0)) {
        throw AppError.forbidden('Invalid permissions value')
    }
    return bits
}

function hasAdministratorBit(permissionsBitfield: string): boolean {
    const bits = parsePermissionBits(permissionsBitfield)
    return (bits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT
}

/**
 * Guild owner or true Discord Administrator bypass the permission cap:
 * Administrator means "can do anything permission-wise", so it does not
 * matter that a granted bit isn't in the requester's own bitfield.
 */
export function isExemptFromPermissionCap(
    context: Pick<RoleGuardContext, 'owner' | 'permissions'>,
): boolean {
    return context.owner || hasAdministratorBit(context.permissions)
}

/**
 * Only the guild owner bypasses Discord's role-hierarchy rule. This is
 * deliberately narrower than isExemptFromPermissionCap: on Discord itself,
 * Administrator does not let a member edit, delete, or reorder a role
 * positioned at or above their own highest role - only the owner is exempt
 * from that structural constraint (#2451 review).
 */
export function isExemptFromHierarchy(
    context: Pick<RoleGuardContext, 'owner'>,
): boolean {
    return context.owner
}

/**
 * Enforces that a role write cannot grant permission bits the requester
 * does not themselves hold (#2451). No-op when `requestedPermissions` is
 * undefined (no permission change requested) or the requester is exempt.
 * Fails closed (403) rather than silently stripping bits.
 */
export function assertRequestedPermissionsWithinGrant(
    context: Pick<RoleGuardContext, 'owner' | 'permissions'>,
    requestedPermissions: string | undefined,
): void {
    if (
        requestedPermissions === undefined ||
        isExemptFromPermissionCap(context)
    ) {
        return
    }

    const requestedBits = parsePermissionBits(requestedPermissions)
    const holderBits = parsePermissionBits(context.permissions)

    if ((requestedBits & holderBits) !== requestedBits) {
        throw AppError.forbidden(
            'Cannot grant permissions you do not hold yourself',
        )
    }
}

/**
 * On Discord, a member without the Manage Roles permission cannot touch
 * roles at all, even if they hold another guild-level permission such as
 * Manage Guild. `/roles/manage/*` was previously reachable with just
 * `settings:manage` (which MANAGE_GUILD alone satisfies), so this closes
 * that gap: every write requires the requester to actually hold Manage
 * Roles, unless they are exempt (owner or true Administrator, same as the
 * permission cap above). Fails closed (403) otherwise (#2451 review).
 */
export function assertCanManageRoles(
    context: Pick<RoleGuardContext, 'owner' | 'permissions'>,
): void {
    if (isExemptFromPermissionCap(context)) {
        return
    }

    const bits = parsePermissionBits(context.permissions)
    if ((bits & MANAGE_ROLES_BIT) !== MANAGE_ROLES_BIT) {
        throw AppError.forbidden('Requires the Manage Roles permission')
    }
}

/**
 * Highest position among the roles the requester holds. A member with no
 * roles is at the @everyone position (0), which is always below every real
 * role returned by getFullGuildRoles (that list excludes @everyone).
 */
export function getHighestRolePosition(
    roleIds: string[],
    allRoles: GuildRoleManage[],
): number {
    const positionById = new Map(
        allRoles.map((role) => [role.id, role.position]),
    )
    let highest = 0
    for (const roleId of roleIds) {
        const position = positionById.get(roleId)
        if (position !== undefined && position > highest) {
            highest = position
        }
    }
    return highest
}

/**
 * Enforces that a role being edited or deleted is strictly below the
 * requester's highest role, mirroring Discord's hierarchy rule (#2451).
 *
 * Skipped (not blocked) only when we genuinely have no way to know the
 * requester's own role positions (`roleDataAvailable` is false - see its
 * doc comment). Fails closed (403) when the role list came back empty,
 * since every caller here passes a real target roleId: getFullGuildRoles
 * returns `[]` both for a guild with genuinely zero custom roles and when
 * the underlying Discord fetch failed, and those are indistinguishable
 * here, so an empty result is treated as "couldn't verify" rather than
 * silently allowed through.
 */
export function assertRoleHierarchyAllowed(
    context: Pick<RoleGuardContext, 'owner' | 'roleIds' | 'roleDataAvailable'>,
    targetRoleId: string,
    allRoles: GuildRoleManage[],
): void {
    if (isExemptFromHierarchy(context)) {
        return
    }

    if (!context.roleDataAvailable) {
        return
    }

    if (allRoles.length === 0) {
        throw AppError.forbidden(
            'Unable to verify role hierarchy right now; please try again',
        )
    }

    const targetRole = allRoles.find((role) => role.id === targetRoleId)
    if (!targetRole) {
        // A non-empty list was fetched successfully but doesn't contain
        // this role - most likely it was already deleted. Let the
        // downstream Discord call be the source of truth (it will 404).
        return
    }

    const requesterHighest = getHighestRolePosition(context.roleIds, allRoles)
    if (targetRole.position >= requesterHighest) {
        throw AppError.forbidden(
            'Cannot modify a role positioned at or above your highest role',
        )
    }
}
