import { ApiError } from '@/services/ApiError'

const MAX_MESSAGE_LENGTH = 200

// Only 4xx messages are written for users; network, timeout and 5xx
// messages are technical, so those get the localized fallback.
export function getApiErrorMessage(error: unknown, fallback: string): string {
    if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.message &&
        error.message.length <= MAX_MESSAGE_LENGTH
    ) {
        return error.message
    }
    return fallback
}
