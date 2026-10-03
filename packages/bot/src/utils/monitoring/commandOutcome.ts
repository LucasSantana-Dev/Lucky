export type CommandKind = 'slash' | 'context' | 'component'
export type CommandOutcome = 'ok' | 'user_error' | 'error' | 'denied'

/** Why a handler stopped before or instead of running the command. */
export type CommandStopReason =
    | 'not_found'
    | 'feature_disabled'
    | 'missing_bot_permissions'
    | 'cooldown'
    | 'blocked'

export type ClassifiedOutcome = {
    outcome: CommandOutcome
    errorClass?: string
}

/**
 * Pure outcome classification. A thrown error always wins (error + class name);
 * otherwise a stop reason maps to denied (permissions, cooldown, blocked) or
 * user_error (unknown command, feature disabled); no signal means ok.
 */
export function classifyOutcome(input: {
    error?: unknown
    reason?: CommandStopReason
}): ClassifiedOutcome {
    if (input.error !== undefined) {
        const err = input.error
        const errorClass =
            err instanceof Error
                ? err.constructor.name
                : typeof err === 'object' && err !== null
                  ? ((err as object).constructor?.name ?? 'Object')
                  : typeof err
        return { outcome: 'error', errorClass }
    }
    switch (input.reason) {
        case 'missing_bot_permissions':
        case 'cooldown':
        case 'blocked':
            return { outcome: 'denied' }
        case 'not_found':
        case 'feature_disabled':
            return { outcome: 'user_error' }
        default:
            return { outcome: 'ok' }
    }
}
