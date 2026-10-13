// The bridge sends one Sentry event (the all-exhausted message) when every
// stage failed. discord-player then wraps the thrown error into a new
// NoResultError whose message embeds only the original `error.stack` text, so
// no property or `cause` survives to handlePlayerError. The marker therefore
// lives in the message, which the wrapped text still carries. Errors thrown on
// paths that did not send the event (empty title, SoundCloud circuit open)
// stay unmarked and are still captured as exceptions.
export const BRIDGE_EXHAUSTED_REPORTED_MARKER = '[sentry-reported]'

export class BridgeExhaustedError extends Error {
    readonly reported: boolean

    constructor(message: string, reported = false) {
        super(
            reported
                ? `${message} ${BRIDGE_EXHAUSTED_REPORTED_MARKER}`
                : message,
        )
        this.name = 'BridgeExhaustedError'
        this.reported = reported
    }
}

export function isReportedBridgeExhausted(error: unknown): boolean {
    if (error instanceof BridgeExhaustedError && error.reported) return true
    const seen = new Set<unknown>()
    let current: unknown = error
    while (current instanceof Error && !seen.has(current)) {
        if (current.message.includes(BRIDGE_EXHAUSTED_REPORTED_MARKER)) {
            return current.message.includes('Bridge exhausted')
        }
        seen.add(current)
        current = (current as { cause?: unknown }).cause
    }
    return false
}
