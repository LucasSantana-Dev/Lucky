import {
    AUTOMATION_MODULES,
    type AutomationModule,
    type GuildAutomationDiffOperation,
    type GuildAutomationManifestDocument,
    type GuildAutomationPlan,
} from './types'

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(
            ([a], [b]) => a.localeCompare(b),
        )
        const serialized = entries
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(',')
        return `{${serialized}}`
    }

    return JSON.stringify(value)
}

function isEqual(a: unknown, b: unknown): boolean {
    return stableStringify(a) === stableStringify(b)
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

function parsePermissions(value: unknown): bigint | null {
    if (typeof value !== 'string' || value.length === 0) {
        return null
    }

    try {
        return BigInt(value)
    } catch {
        return null
    }
}

function isRolePermissionTightening(desired: unknown, actual: unknown): boolean {
    const desiredRole = asRecord(desired)
    const actualRole = asRecord(actual)
    if (!desiredRole || !actualRole) {
        return false
    }

    const desiredPermissions = parsePermissions(desiredRole.permissions)
    const actualPermissions = parsePermissions(actualRole.permissions)
    if (desiredPermissions === null || actualPermissions === null) {
        return false
    }

    return (desiredPermissions & actualPermissions) !== actualPermissions
}

function isChannelReadonlyTightening(desired: unknown, actual: unknown): boolean {
    const desiredChannel = asRecord(desired)
    const actualChannel = asRecord(actual)
    if (!desiredChannel || !actualChannel) {
        return false
    }

    return actualChannel.readonly !== true && desiredChannel.readonly === true
}

function isCommandAccessTightening(desired: unknown, actual: unknown): boolean {
    const desiredRoot = asRecord(desired)
    const actualRoot = asRecord(actual)
    if (!desiredRoot || !actualRoot) {
        return false
    }

    const desiredGrants = new Map<string, string>()
    for (const grant of asArray(desiredRoot.grants)) {
        const grantRecord = asRecord(grant)
        if (!grantRecord) {
            continue
        }

        const roleId = typeof grantRecord.roleId === 'string' ? grantRecord.roleId : null
        const module = typeof grantRecord.module === 'string' ? grantRecord.module : null
        const mode = typeof grantRecord.mode === 'string' ? grantRecord.mode : null
        if (!roleId || !module || !mode) {
            continue
        }

        desiredGrants.set(`${roleId}:${module}`, mode)
    }

    for (const grant of asArray(actualRoot.grants)) {
        const grantRecord = asRecord(grant)
        if (!grantRecord) {
            continue
        }

        const roleId = typeof grantRecord.roleId === 'string' ? grantRecord.roleId : null
        const module = typeof grantRecord.module === 'string' ? grantRecord.module : null
        const mode = typeof grantRecord.mode === 'string' ? grantRecord.mode : null
        if (!roleId || !module || !mode) {
            continue
        }

        const key = `${roleId}:${module}`
        const nextMode = desiredGrants.get(key)
        if (!nextMode) {
            return true
        }

        if (mode === 'manage' && nextMode === 'view') {
            return true
        }
    }

    return false
}

function isOnboardingTightening(desired: unknown, actual: unknown): boolean {
    const desiredOnboarding = asRecord(desired)
    const actualOnboarding = asRecord(actual)
    if (!desiredOnboarding || !actualOnboarding) {
        return false
    }

    const desiredDefaults = new Set(
        asArray(desiredOnboarding.defaultChannelIds).filter(
            (item): item is string => typeof item === 'string',
        ),
    )
    for (const channelId of asArray(actualOnboarding.defaultChannelIds)) {
        if (typeof channelId === 'string' && !desiredDefaults.has(channelId)) {
            return true
        }
    }

    const desiredPrompts = new Set(
        asArray(desiredOnboarding.prompts).map((prompt) => {
            const promptRecord = asRecord(prompt)
            return typeof promptRecord?.id === 'string'
                ? promptRecord.id
                : String(promptRecord?.title ?? '')
        }),
    )

    for (const prompt of asArray(actualOnboarding.prompts)) {
        const promptRecord = asRecord(prompt)
        const key =
            typeof promptRecord?.id === 'string'
                ? promptRecord.id
                : String(promptRecord?.title ?? '')
        if (key.length > 0 && !desiredPrompts.has(key)) {
            return true
        }
    }

    return false
}

function isPermissionTightening(params: {
    module: AutomationModule
    target: string
    desired: unknown
    actual: unknown
}): boolean {
    const { module, target, desired, actual } = params

    if (module === 'roles' && target.startsWith('roles/')) {
        return isRolePermissionTightening(desired, actual)
    }

    if (module === 'roles' && target.startsWith('channels/')) {
        return isChannelReadonlyTightening(desired, actual)
    }

    if (module === 'commandaccess') {
        return isCommandAccessTightening(desired, actual)
    }

    if (module === 'onboarding') {
        return isOnboardingTightening(desired, actual)
    }

    return false
}

function pushIfChanged(params: {
    operations: GuildAutomationDiffOperation[]
    module: AutomationModule
    target: string
    desired: unknown
    actual: unknown
    protectedDelete?: boolean
}): void {
    const { operations, module, target, desired, actual, protectedDelete } = params

    if (desired === undefined && actual === undefined) {
        return
    }

    if (desired === undefined && actual !== undefined) {
        operations.push({
            module,
            action: 'delete',
            target,
            protected: protectedDelete ?? true,
            desired,
            actual,
            reason: 'Desired manifest removed this target',
        })
        return
    }

    if (desired !== undefined && actual === undefined) {
        operations.push({
            module,
            action: 'create',
            target,
            protected: false,
            desired,
            actual,
            reason: 'Target missing from current state',
        })
        return
    }

    if (!isEqual(desired, actual)) {
        operations.push({
            module,
            action: 'update',
            target,
            protected: isPermissionTightening({
                module,
                target,
                desired,
                actual,
            }),
            desired,
            actual,
            reason: 'Target differs from desired manifest',
        })
    }
}

function diffRolesAndChannels(
    desired: GuildAutomationManifestDocument['roles'],
    actual: GuildAutomationManifestDocument['roles'],
): GuildAutomationDiffOperation[] {
    const operations: GuildAutomationDiffOperation[] = []

    const desiredRoles = new Map((desired?.roles ?? []).map((role) => [role.id, role]))
    const actualRoles = new Map((actual?.roles ?? []).map((role) => [role.id, role]))

    const desiredChannels = new Map(
        (desired?.channels ?? []).map((channel) => [channel.id, channel]),
    )
    const actualChannels = new Map(
        (actual?.channels ?? []).map((channel) => [channel.id, channel]),
    )

    const allRoleIds = new Set([...desiredRoles.keys(), ...actualRoles.keys()])
    for (const roleId of allRoleIds) {
        pushIfChanged({
            operations,
            module: 'roles',
            target: `roles/${roleId}`,
            desired: desiredRoles.get(roleId),
            actual: actualRoles.get(roleId),
            protectedDelete: true,
        })
    }

    const allChannelIds = new Set([...desiredChannels.keys(), ...actualChannels.keys()])
    for (const channelId of allChannelIds) {
        pushIfChanged({
            operations,
            module: 'roles',
            target: `channels/${channelId}`,
            desired: desiredChannels.get(channelId),
            actual: actualChannels.get(channelId),
            protectedDelete: true,
        })
    }

    return operations
}

function countByModule(
    operations: GuildAutomationDiffOperation[],
): Record<AutomationModule, number> {
    const base = Object.fromEntries(AUTOMATION_MODULES.map((module) => [module, 0])) as Record<
        AutomationModule,
        number
    >

    for (const operation of operations) {
        base[operation.module] += 1
    }

    return base
}

export function createAutomationPlan(params: {
    desired: GuildAutomationManifestDocument
    actual: GuildAutomationManifestDocument
}): GuildAutomationPlan {
    const { desired, actual } = params
    const operations: GuildAutomationDiffOperation[] = []

    pushIfChanged({
        operations,
        module: 'onboarding',
        target: 'onboarding',
        desired: desired.onboarding,
        actual: actual.onboarding,
        protectedDelete: true,
    })

    operations.push(...diffRolesAndChannels(desired.roles, actual.roles))

    pushIfChanged({
        operations,
        module: 'moderation',
        target: 'moderation',
        desired: desired.moderation,
        actual: actual.moderation,
    })

    pushIfChanged({
        operations,
        module: 'automessages',
        target: 'automessages',
        desired: desired.automessages,
        actual: actual.automessages,
    })

    pushIfChanged({
        operations,
        module: 'reactionroles',
        target: 'reactionroles',
        desired: desired.reactionroles,
        actual: actual.reactionroles,
        protectedDelete: true,
    })

    pushIfChanged({
        operations,
        module: 'commandaccess',
        target: 'commandaccess',
        desired: desired.commandaccess,
        actual: actual.commandaccess,
    })

    pushIfChanged({
        operations,
        module: 'parity',
        target: 'parity',
        desired: desired.parity,
        actual: actual.parity,
        protectedDelete: true,
    })

    const protectedOperations = operations.filter((operation) => operation.protected)

    return {
        operations,
        protectedOperations,
        summary: {
            total: operations.length,
            safe: operations.length - protectedOperations.length,
            protected: protectedOperations.length,
            byModule: countByModule(operations),
        },
    }
}

export function isPlanIdempotent(plan: GuildAutomationPlan): boolean {
    return plan.operations.length === 0
}
