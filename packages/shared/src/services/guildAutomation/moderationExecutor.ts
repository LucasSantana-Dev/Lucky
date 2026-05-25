import { type ExecutorApplyResult, type ExecutorOpError } from './types'

export type ModerationManifestSection = {
    automod?: Record<string, unknown>
    moderationSettings?: Record<string, unknown>
}

export type ModerationLiveState = Record<string, never>

export type ModerationDiffOp =
    | { kind: 'update-automod'; settings: Record<string, unknown> }
    | { kind: 'update-moderation-settings'; settings: Record<string, unknown> }
    | { kind: 'noop' }

export type ModerationDiff = { ops: ModerationDiffOp[] }

export type ModerationResult = {
    applied: Array<'automod' | 'moderationSettings' | 'noop'>
}

export type ModerationPort = {
    updateAutoModSettings(
        guildId: string,
        settings: Record<string, unknown>,
    ): Promise<unknown>
    updateModerationSettings(
        guildId: string,
        settings: Record<string, unknown>,
    ): Promise<unknown>
}

export function createModerationExecutor(deps: { port: ModerationPort }) {
    const { port } = deps

    return {
        capture(): ModerationLiveState {
            return {}
        },

        diff(
            _live: ModerationLiveState,
            section: ModerationManifestSection,
        ): ModerationDiff {
            const ops: ModerationDiffOp[] = []

            if (section.automod) {
                ops.push({ kind: 'update-automod', settings: section.automod })
            }

            if (section.moderationSettings) {
                ops.push({
                    kind: 'update-moderation-settings',
                    settings: section.moderationSettings,
                })
            }

            if (ops.length === 0) {
                ops.push({ kind: 'noop' })
            }

            return { ops }
        },

        async apply(
            diff: ModerationDiff,
            ctx: { guildId: string },
        ): Promise<ExecutorApplyResult<ModerationResult['applied']>> {
            const applied: ModerationResult['applied'] = []
            const errors: ExecutorOpError[] = []

            for (let opIndex = 0; opIndex < diff.ops.length; opIndex++) {
                const op = diff.ops[opIndex]
                try {
                    if (op.kind === 'update-automod') {
                        await port.updateAutoModSettings(
                            ctx.guildId,
                            op.settings,
                        )
                        applied.push('automod')
                        continue
                    }

                    if (op.kind === 'update-moderation-settings') {
                        await port.updateModerationSettings(
                            ctx.guildId,
                            op.settings,
                        )
                        applied.push('moderationSettings')
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
