import type { BatchJobType } from './types.js'

/**
 * Permission requirements for each batch job type.
 */
const PERMISSION_REQUIREMENTS: Record<
    BatchJobType,
    {
        source?: string[]
        target?: string[]
    }
> = {
    channel_move_batch: {
        source: ['ManageMessages'],
        target: ['SendMessages', 'EmbedLinks', 'AttachFiles'],
    },
    bulk_ban: {
        target: ['BanMembers'],
    },
    bulk_kick: {
        target: ['KickMembers'],
    },
    bulk_warn: {
        target: ['ManageMessages'],
    },
    bulk_add_role: {
        target: ['ManageRoles'],
    },
    bulk_remove_role: {
        target: ['ManageRoles'],
    },
    purge_batch: {
        source: ['ManageMessages'],
    },
}

/**
 * Result of a permission check.
 */
export interface PermissionCheckResult {
    allowed: boolean
    missing: string[]
}

/**
 * Checks whether the provided permissions satisfy the requirements for a batch job type.
 * Permissions are passed as plain booleans to enable unit testing without live discord.js Guild.
 *
 * @param jobType The batch job type
 * @param permissions Object with permission name -> boolean mappings
 * @returns PermissionCheckResult indicating allowed status and missing permissions
 */
export function checkBatchPermissions(
    jobType: BatchJobType,
    permissions: Record<string, boolean>,
): PermissionCheckResult {
    const requirements = PERMISSION_REQUIREMENTS[jobType]
    if (!requirements) {
        return { allowed: false, missing: ['Unknown job type'] }
    }

    const missing: string[] = []

    // Check source permissions
    if (requirements.source) {
        for (const perm of requirements.source) {
            if (!permissions[perm]) {
                missing.push(`Source: ${perm}`)
            }
        }
    }

    // Check target permissions
    if (requirements.target) {
        for (const perm of requirements.target) {
            if (!permissions[perm]) {
                missing.push(`Target: ${perm}`)
            }
        }
    }

    return {
        allowed: missing.length === 0,
        missing,
    }
}
