import type { ExecutorApplyResult, ExecutorOpError } from './types'

/** Type of auto message (welcome or leave). */
type AutoMessageType = 'welcome' | 'leave'

/** Snapshot of a stored auto message. */
type AutoMessageSnapshot = {
    id: string
    channelId: string | null
    message: string | null
    enabled: boolean
} | null

/** Current live state of auto messages in a guild. */
export type AutoMessagesLiveState = {
    welcome: AutoMessageSnapshot
    leave: AutoMessageSnapshot
}

/** Auto messages section of the manifest document. */
export type AutoMessagesManifestSection = {
    welcome?: { enabled?: boolean; channelId?: string; message?: string }
    leave?: { enabled?: boolean; channelId?: string; message?: string }
}

/** Diff operation for auto message changes. */
export type AutoMessagesDiffOp =
    | {
          kind: 'create'
          type: AutoMessageType
          message: string
          channelId?: string
      }
    | {
          kind: 'update'
          type: AutoMessageType
          id: string
          message?: string
          channelId?: string
          enabled?: boolean
      }
    | { kind: 'noop'; type: AutoMessageType }

/** Diff between auto message manifest and live state. */
export type AutoMessagesDiff = { ops: AutoMessagesDiffOp[] }

/** Result of auto message apply operation. */
export type AutoMessagesResult = {
    applied: Array<{
        type: AutoMessageType
        action: 'create' | 'update' | 'noop'
    }>
}

/** Context for executor operations. */
export type ExecutorContext = { guildId: string }

/** Port interface for auto message operations. */
export type AutoMessagesPort = {
    getWelcomeMessage(guildId: string): Promise<AutoMessageSnapshot>
    getLeaveMessage(guildId: string): Promise<AutoMessageSnapshot>
    createMessage(
        guildId: string,
        type: AutoMessageType,
        data: { message: string },
        options?: { channelId?: string },
    ): Promise<{ id: string }>
    updateMessage(
        id: string,
        data: {
            message?: string
            channelId?: string
            enabled?: boolean
        },
    ): Promise<unknown>
}

/** Creates an auto messages executor with given dependencies. */
export function createAutoMessagesExecutor(deps: {
    autoMessageService: AutoMessagesPort
}) {
    const svc = deps.autoMessageService
    const MODULE_TYPES: readonly AutoMessageType[] = ['welcome', 'leave']

    return {
        async capture(ctx: ExecutorContext): Promise<AutoMessagesLiveState> {
            const [welcome, leave] = await Promise.all([
                svc.getWelcomeMessage(ctx.guildId),
                svc.getLeaveMessage(ctx.guildId),
            ])
            return { welcome, leave }
        },

        diff(
            live: AutoMessagesLiveState,
            section: AutoMessagesManifestSection,
        ): AutoMessagesDiff {
            const ops: AutoMessagesDiffOp[] = []
            for (const type of MODULE_TYPES) {
                const want = section[type]
                const have = live[type]
                if (!want?.message) {
                    ops.push({ kind: 'noop', type })
                    continue
                }
                if (!have) {
                    ops.push({
                        kind: 'create',
                        type,
                        message: want.message,
                        channelId: want.channelId,
                    })
                    continue
                }
                ops.push({
                    kind: 'update',
                    type,
                    id: have.id,
                    message: want.message,
                    channelId: want.channelId,
                    enabled: want.enabled,
                })
            }
            return { ops }
        },

        async apply(
            diff: AutoMessagesDiff,
            ctx: ExecutorContext,
        ): Promise<ExecutorApplyResult<AutoMessagesResult['applied']>> {
            const applied: AutoMessagesResult['applied'] = []
            const errors: ExecutorOpError[] = []

            for (let opIndex = 0; opIndex < diff.ops.length; opIndex++) {
                const op = diff.ops[opIndex]
                try {
                    if (op.kind === 'create') {
                        await svc.createMessage(
                            ctx.guildId,
                            op.type,
                            { message: op.message },
                            { channelId: op.channelId },
                        )
                        applied.push({ type: op.type, action: 'create' })
                        continue
                    }
                    if (op.kind === 'update') {
                        await svc.updateMessage(op.id, {
                            message: op.message,
                            channelId: op.channelId,
                            enabled: op.enabled,
                        })
                        applied.push({ type: op.type, action: 'update' })
                        continue
                    }
                    applied.push({ type: op.type, action: 'noop' })
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
