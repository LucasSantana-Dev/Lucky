import type {
    ReactionRoleMessage,
    CreateReactionRolePayload,
} from '@/services/reactionRolesApi'

export interface ExportedReactionRole {
    channelId: string
    title: string
    description: string
    imageUrl?: string
    roles: Array<{
        roleId: string
        label: string
        emoji?: string
        style?: 'Primary' | 'Secondary' | 'Success' | 'Danger'
    }>
}

export function serializeReactionRolesToJSON(
    messages: ReactionRoleMessage[],
): ExportedReactionRole[] {
    return messages.map((message) => {
        const exported: ExportedReactionRole = {
            channelId: message.channelId,
            title: message.title || '',
            description: message.description || '',
            roles: message.mappings.map((m) => {
                const role: ExportedReactionRole['roles'][number] = {
                    roleId: m.roleId,
                    label: m.label,
                }
                if (m.emoji) role.emoji = m.emoji
                if (m.style)
                    role.style = m.style as
                        | 'Primary'
                        | 'Secondary'
                        | 'Success'
                        | 'Danger'
                return role
            }),
        }
        if (message.imageUrl) {
            exported.imageUrl = message.imageUrl
        }
        return exported
    })
}

export interface DeserializeResult {
    valid: boolean
    data: CreateReactionRolePayload[]
    errors: string[]
}

const VALID_STYLES = ['Primary', 'Secondary', 'Success', 'Danger']
const SNOWFLAKE_REGEX = /^\d{17,20}$/
const MAX_TITLE = 256
const MAX_DESCRIPTION = 4096
const MAX_LABEL = 80
const MAX_ROLES = 25
const MIN_ROLES = 1

export function deserializeReactionRolesJSON(
    jsonString: string,
): DeserializeResult {
    const errors: string[] = []
    const data: CreateReactionRolePayload[] = []

    let parsed: unknown
    try {
        parsed = JSON.parse(jsonString)
    } catch {
        return {
            valid: false,
            data: [],
            errors: ['Invalid JSON format'],
        }
    }

    if (!Array.isArray(parsed)) {
        return {
            valid: false,
            data: [],
            errors: ['Invalid JSON or not an array'],
        }
    }

    parsed.forEach((item, index) => {
        const itemPrefix = `Item ${index}: `

        if (!item || typeof item !== 'object') {
            errors.push(`${itemPrefix}Must be an object`)
            return
        }

        // Validate channelId
        if (!item.channelId) {
            errors.push(`${itemPrefix}channelId is required`)
            return
        }
        if (!SNOWFLAKE_REGEX.test(String(item.channelId))) {
            errors.push(
                `${itemPrefix}channelId must be a valid Discord snowflake (17-20 digits)`,
            )
            return
        }

        // Validate title
        if (!item.title || typeof item.title !== 'string') {
            errors.push(`${itemPrefix}title is required and must be a string`)
            return
        }
        if (item.title.length < 1 || item.title.length > MAX_TITLE) {
            errors.push(`${itemPrefix}title must be 1-${MAX_TITLE} characters`)
            return
        }

        // Validate description
        if (!item.description || typeof item.description !== 'string') {
            errors.push(
                `${itemPrefix}description is required and must be a string`,
            )
            return
        }
        if (
            item.description.length < 1 ||
            item.description.length > MAX_DESCRIPTION
        ) {
            errors.push(
                `${itemPrefix}description must be 1-${MAX_DESCRIPTION} characters`,
            )
            return
        }

        // Validate roles
        if (!Array.isArray(item.roles)) {
            errors.push(`${itemPrefix}roles must be an array`)
            return
        }
        if (item.roles.length < MIN_ROLES || item.roles.length > MAX_ROLES) {
            errors.push(
                `${itemPrefix}roles must have ${MIN_ROLES}-${MAX_ROLES} items`,
            )
            return
        }

        // Validate each role
        let rolesValid = true
        for (let i = 0; i < item.roles.length; i++) {
            const role = item.roles[i]
            const rolePrefix = `${itemPrefix}Role ${i}: `

            if (!role || typeof role !== 'object') {
                errors.push(`${rolePrefix}Must be an object`)
                rolesValid = false
                break
            }

            if (!role.roleId) {
                errors.push(`${rolePrefix}roleId is required`)
                rolesValid = false
                break
            }
            if (!SNOWFLAKE_REGEX.test(String(role.roleId))) {
                errors.push(
                    `${rolePrefix}roleId must be a valid Discord snowflake`,
                )
                rolesValid = false
                break
            }

            if (!role.label || typeof role.label !== 'string') {
                errors.push(
                    `${rolePrefix}label is required and must be a string`,
                )
                rolesValid = false
                break
            }
            if (role.label.length < 1 || role.label.length > MAX_LABEL) {
                errors.push(
                    `${rolePrefix}label must be 1-${MAX_LABEL} characters`,
                )
                rolesValid = false
                break
            }

            if (role.style && !VALID_STYLES.includes(role.style)) {
                errors.push(
                    `${rolePrefix}style must be one of: ${VALID_STYLES.join(', ')}`,
                )
                rolesValid = false
                break
            }
        }

        if (!rolesValid) {
            return
        }

        // Build the payload
        const payload: CreateReactionRolePayload = {
            channelId: String(item.channelId),
            title: item.title,
            description: item.description,
            roles: item.roles.map((r: any) => ({
                roleId: String(r.roleId),
                label: r.label,
                ...(r.emoji && { emoji: r.emoji }),
                ...(r.style && { style: r.style }),
            })),
        }

        if (item.imageUrl) {
            payload.imageUrl = item.imageUrl
        }

        data.push(payload)
    })

    return {
        valid: errors.length === 0,
        data,
        errors,
    }
}
