/**
 * Utility functions to sanitize error messages for user-facing content
 * Prevents system paths and sensitive information from being exposed
 */

export function sanitizeErrorMessage(error: unknown): string {
    if (!error) return 'An unknown error occurred'

    let errorMessage = ''

    if (error instanceof Error) {
        errorMessage = error.message
    } else if (typeof error === 'string') {
        errorMessage = error
    } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error)
    } else {
        errorMessage = String(error)
    }

    return sanitizeMessage(errorMessage)
}

export function sanitizeMessage(message: string): string {
    if (!message) return 'An unknown error occurred'

    // Strip URLs first so the path regex below doesn't treat URL slashes as system paths
    let sanitized = message.replace(/https?:\/\/[^\s"]*/g, '[URL]')

    // Remove system paths (Windows and Unix style)
    sanitized = sanitized
        .replace(/[A-Z]:\\[^"]*\\/gi, '[SYSTEM_PATH]\\')
        .replace(/\/[^"]*\//g, '[SYSTEM_PATH]/')
        .replace(/C:\\[^"]*\\/gi, '[SYSTEM_PATH]\\')
        .replace(/\/c\/[^"]*\//gi, '[SYSTEM_PATH]/')

    // Remove specific error patterns that expose system information
    sanitized = sanitized
        .replace(/Cannot find module '[^']*'/g, 'Required dependency not found')
        .replace(/Cannot read properties of undefined/g, 'Configuration error')
        .replace(/spawn\([^)]*\)/g, 'External process')
        .replace(/require\([^)]*\)/g, 'Module loading')
        .replace(/Require stack:[^\n]*/g, '')

    // Remove any remaining file paths
    sanitized = sanitized
        .replace(/at [^(]*\([^)]*\)/g, 'at [INTERNAL_FUNCTION]')
        .replace(/at [^(]*\.[^:]*:[0-9]+:[0-9]+/g, 'at [INTERNAL_LOCATION]')

    // Clean up multiple spaces and newlines
    sanitized = sanitized.replace(/\s+/g, ' ').replace(/\n+/g, ' ').trim()

    // If the message is too technical, provide a generic one
    if (
        sanitized.includes('[SYSTEM_PATH]') ||
        sanitized.includes('Cannot find module') ||
        sanitized.includes('spawn') ||
        sanitized.includes('require')
    ) {
        return 'A system configuration error occurred. Please contact support if this persists.'
    }

    return sanitized || 'An unknown error occurred'
}

/**
 * Sanitize a stack trace for logging: redact absolute file paths to their basename
 * and strip URLs, while keeping the frame structure so the stack stays debuggable.
 * Returns `undefined` when there is no stack (so callers can fall back to the message).
 */
export function sanitizeStack(error: unknown): string | undefined {
    if (!(error instanceof Error) || !error.stack) return undefined
    return error.stack
        .split('\n')
        .map((line) =>
            line
                .replace(/https?:\/\/\S+/g, '[url]')
                // Redact an absolute path (Unix `/…` or Windows `C:\…`) to its
                // basename. Uses a linear, delimiter-anchored pattern (no overlapping
                // quantifiers) to stay ReDoS-safe; assumes no spaces in path segments,
                // which holds for this Linux/Docker deployment.
                .replace(
                    /(?:file:\/\/)?(?:[A-Za-z]:\\|\/)(?:[^\s():\\/]+[\\/])+([^\s():\\/]+)/g,
                    '[path]/$1',
                ),
        )
        .join('\n')
}

/**
 * Strip control characters (newlines, tabs, etc.) from a value before it is
 * interpolated into a log message, preventing log forging / injection (CWE-117).
 */
export function sanitizeLogInput(value: string): string {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f]/g, '')
}

/**
 * Check if error message contains specific keywords
 */
function containsErrorKeywords(message: string, keywords: string[]): boolean {
    return keywords.some((keyword) =>
        message.toLowerCase().includes(keyword.toLowerCase()),
    )
}

/**
 * Map technical errors to user-friendly messages
 */
function mapTechnicalErrors(sanitized: string): string | null {
    const errorMappings = [
        {
            keywords: ['could not extract stream', 'bridge exhausted'],
            message:
                "Couldn't play this track. The video may be unavailable or restricted. Try searching by name instead.",
        },
        {
            keywords: ['youtube: track metadata unavailable'],
            message:
                "Couldn't retrieve this YouTube video. It may be unavailable, age-restricted, or geo-blocked.",
        },
        {
            keywords: ['ffmpeg'],
            message:
                'Audio processing is currently unavailable. Please try again later.',
        },
        {
            keywords: ['download'],
            message:
                'Download failed. The content may be unavailable or restricted.',
        },
        {
            keywords: ['connection'],
            message:
                'Connection error. Please check your internet connection and try again.',
        },
        {
            keywords: ['timeout'],
            message: 'Request timed out. Please try again.',
        },
        {
            keywords: ['permission'],
            message:
                'Permission denied. Please check your settings and try again.',
        },
    ]

    for (const mapping of errorMappings) {
        if (containsErrorKeywords(sanitized, mapping.keywords)) {
            return mapping.message
        }
    }

    return null
}

export function createUserFriendlyError(error: unknown): string {
    const sanitized = sanitizeErrorMessage(error)
    const userFriendlyMessage = mapTechnicalErrors(sanitized)

    return userFriendlyMessage ?? sanitized
}
