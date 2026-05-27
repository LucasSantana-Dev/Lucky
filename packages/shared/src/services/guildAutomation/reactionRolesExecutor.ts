import { type ExecutorApplyResult, type ExecutorOpError } from './types'

type ExclusiveRolePair = {
    roleId: string
    excludedRoleId: string
}

export type ReactionRolesLiveState = {
    exclusiveRoles: ExclusiveRolePair[]
}

export type ReactionRolesManifestSection = {
    messages?: Array<{ messageId?: string; channelId?: string }>
    exclusiveRoles?: ExclusiveRolePair[]
}

export type ReactionRolesDiffOp =
    | { kind: 'remove-exclusive'; roleId: string; excludedRoleId: string }
    | { kind: 'set-exclusive'; roleId: string; excludedRoleId: string }
    | { kind: 'skip-messages'; count: number }
    | { kind: 'noop' }

export type ReactionRolesDiff = { ops: ReactionRolesDiffOp[] }

export type ReactionRolesResult = {
    applied: Array<
        'remove-exclusive' | 'set-exclusive' | 'skip-messages' | 'noop'
    >
}

export type ReactionRolesPort = {
    listExclusiveRoles(guildId: string): Promise<ExclusiveRolePair[]>
    removeExclusiveRole(
        guildId: string,
        roleId: string,
        excludedRoleId: string,
    ): Promise<unknown>
    setExclusiveRole(
        guildId: string,
        roleId: string,
        excludedRoleId: string,
    ): Promise<unknown>
}

export type ReactionRolesExecutorContext = { guildId: string }

export function createReactionRolesExecutor(deps: { port: ReactionRolesPort }) {
    const { port } = deps

    return {
        async capture(
            ctx: ReactionRolesExecutorContext,
        ): Promise<ReactionRolesLiveState> {
            const exclusiveRoles = await port.listExclusiveRoles(ctx.guildId)
            return { exclusiveRoles }
        },

        diff(
            live: ReactionRolesLiveState,
            section: ReactionRolesManifestSection,
        ): ReactionRolesDiff {
            const ops: ReactionRolesDiffOp[] = []

            const desiredPairs = section.exclusiveRoles ?? []
            const desiredKeys = new Set(
                desiredPairs.map((p) => `${p.roleId}:${p.excludedRoleId}`),
            )

            for (const pair of live.exclusiveRoles) {
                if (!desiredKeys.has(`${pair.roleId}:${pair.excludedRoleId}`)) {
                    ops.push({
                        kind: 'remove-exclusive',
                        roleId: pair.roleId,
                        excludedRoleId: pair.excludedRoleId,
                    })
                }
            }

            for (const pair of desiredPairs) {
                ops.push({
                    kind: 'set-exclusive',
                    roleId: pair.roleId,
                    excludedRoleId: pair.excludedRoleId,
                })
            }

            const messageCount = section.messages?.length ?? 0
            if (messageCount > 0) {
                ops.push({ kind: 'skip-messages', count: messageCount })
            }

            if (ops.length === 0) {
                ops.push({ kind: 'noop' })
            }

            return { ops }
        },

        async apply(
            diff: ReactionRolesDiff,
            ctx: ReactionRolesExecutorContext,
        ): Promise<ExecutorApplyResult<ReactionRolesResult['applied']>> {
            const applied: ReactionRolesResult['applied'] = []
            const errors: ExecutorOpError[] = []

            for (let opIndex = 0; opIndex < diff.ops.length; opIndex++) {
                const op = diff.ops[opIndex]
                try {
                    if (op.kind === 'remove-exclusive') {
                        await port.removeExclusiveRole(
                            ctx.guildId,
                            op.roleId,
                            op.excludedRoleId,
                        )
                        applied.push('remove-exclusive')
                        continue
                    }

                    if (op.kind === 'set-exclusive') {
                        await port.setExclusiveRole(
                            ctx.guildId,
                            op.roleId,
                            op.excludedRoleId,
                        )
                        applied.push('set-exclusive')
                        continue
                    }

                    if (op.kind === 'skip-messages') {
                        applied.push('skip-messages')
                        continue
                    }

                    applied.push('noop')
                } catch (err) {
                    errors.push({
                        opIndex,
                        opKind: op.kind,
                        reason: String(err),
                    })
                }
            }

            if (errors.length === 0) {
                return { status: 'success', applied }
            }

            if (applied.length > 0) {
                return { status: 'partial', applied, errors }
            }

            return {
                status: 'failed',
                error: errors.map((e) => e.reason).join('; '),
            }
        },
    }
}
