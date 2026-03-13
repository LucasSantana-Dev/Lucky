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
            protected: false,
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
