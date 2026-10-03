export type CommandKind = 'slash' | 'context' | 'component'
export type CommandOutcome = 'ok' | 'user_error' | 'error' | 'denied'

/** Why a handler stopped before or instead of running the command. */
export type CommandStopReason =
    'not_found' | 'feature_disabled' | 'missing_bot_permissions'

export type ClassifiedOutcome = {
    outcome: CommandOutcome
    errorClass?: string
}

const errorClassOf = (err: unknown): string => {
    if (err instanceof Error) return err.constructor.name
    if (typeof err === 'object' && err !== null) {
        return (err as object).constructor?.name ?? 'Object'
    }
    return typeof err
}

/**
 * Pure outcome classification. Presence of an `error` property (even with the
 * value undefined, as in `throw undefined`) means error; otherwise a stop
 * reason maps to denied (missing bot permissions) or user_error (unknown
 * command, feature disabled); no signal means ok. An unrecognised reason is an
 * error, never silently ok.
 */
export function classifyOutcome(input: {
    error?: unknown
    reason?: CommandStopReason
}): ClassifiedOutcome {
    if ('error' in input) {
        return { outcome: 'error', errorClass: errorClassOf(input.error) }
    }
    switch (input.reason) {
        case undefined:
            return { outcome: 'ok' }
        case 'missing_bot_permissions':
            return { outcome: 'denied' }
        case 'not_found':
        case 'feature_disabled':
            return { outcome: 'user_error' }
        default:
            return { outcome: 'error', errorClass: 'UnknownStopReason' }
    }
}
