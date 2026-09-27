import { AppError } from '../errors/AppError'
import type { GuildRoleManage } from '../services/RoleService'

const ADMINISTRATOR_BIT = BigInt(0x8)

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
}

function toBigIntSafe(value: string | undefined | null): bigint {
    if (!value) {
        return BigInt(0)
    }
    try {
        return BigInt(value)
    } catch {
        return BigInt(0)
    }
}

/**
 * Guild owner or true Discord Administrator bypass the role permission cap
 * and hierarchy checks below, mirroring Discord's own rule. This is
 * intentionally narrower than the dashboard's `isAdmin` concept (which also
 * treats MANAGE_GUILD as admin-equivalent for broader dashboard access) -
 * MANAGE_GUILD alone does not exempt a member from Discord's role hierarchy.
 */
export function isExemptFromRoleCap(context: RoleGuardContext): boolean {
    if (context.owner) {
        return true
    }
    const bits = toBigIntSafe(context.permissions)
    return (bits & ADMINISTRATOR_BIT) === ADMINISTRATOR_BIT
}

/**
 * Enforces that a role write cannot grant permission bits the requester
 * does not themselves hold (#2451). No-op when `requestedPermissions` is
 * undefined (no permission change requested) or the requester is exempt.
 * Fails closed (403) rather than silently stripping bits.
 */
export function assertRequestedPermissionsWithinGrant(
    context: RoleGuardContext,
    requestedPermissions: string | undefined,
): void {
    if (requestedPermissions === undefined || isExemptFromRoleCap(context)) {
        return
    }

    const requestedBits = toBigIntSafe(requestedPermissions)
    const holderBits = toBigIntSafe(context.permissions)

    if ((requestedBits & holderBits) !== requestedBits) {
        throw AppError.forbidden(
            'Cannot grant permissions you do not hold yourself',
        )
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
 * Skipped when the requester is exempt, or when the target role's position
 * cannot be resolved from `allRoles` (data not reliably available) - the
 * downstream Discord call remains the source of truth for a genuinely
 * missing role.
 */
export function assertRoleHierarchyAllowed(
    context: RoleGuardContext,
    targetRoleId: string,
    allRoles: GuildRoleManage[],
): void {
    if (isExemptFromRoleCap(context)) {
        return
    }

    const targetRole = allRoles.find((role) => role.id === targetRoleId)
    if (!targetRole) {
        return
    }

    const requesterHighest = getHighestRolePosition(context.roleIds, allRoles)
    if (targetRole.position >= requesterHighest) {
        throw AppError.forbidden(
            'Cannot modify a role positioned at or above your highest role',
        )
    }
}
