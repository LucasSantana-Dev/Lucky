/** Error codes for system and runtime failures. */
export const SYSTEM_ERROR_CODES = {
    SYSTEM_OUT_OF_MEMORY: 'ERR_SYSTEM_OUT_OF_MEMORY',
    SYSTEM_FILE_NOT_FOUND: 'ERR_SYSTEM_FILE_NOT_FOUND',
    SYSTEM_PERMISSION_DENIED: 'ERR_SYSTEM_PERMISSION_DENIED',
} as const

/** Type representing system error codes. */
export type SystemErrorCode =
    (typeof SYSTEM_ERROR_CODES)[keyof typeof SYSTEM_ERROR_CODES]

/** Error for application configuration issues. */
export class ConfigurationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ConfigurationError'
    }
}
