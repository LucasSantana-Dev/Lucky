/**
 * Twitch rejected the user access token (HTTP 401). Retrying with the same
 * credentials cannot succeed, so callers stop instead of looping.
 */
export class TwitchAuthError extends Error {
    readonly status = 401

    constructor(message: string) {
        super(message)
        this.name = 'TwitchAuthError'
    }
}

export function isTwitchAuthError(error: unknown): error is TwitchAuthError {
    return error instanceof TwitchAuthError
}
