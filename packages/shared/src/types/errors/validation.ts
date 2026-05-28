/** Error codes for validation failures. */
export const VALIDATION_ERROR_CODES = {
    VALIDATION_INVALID_INPUT: 'ERR_VALIDATION_INVALID_INPUT',
    VALIDATION_MISSING_REQUIRED_FIELD: 'ERR_VALIDATION_MISSING_REQUIRED_FIELD',
    VALIDATION_INVALID_FORMAT: 'ERR_VALIDATION_INVALID_FORMAT',
} as const

/** Type representing validation error codes. */
export type ValidationErrorCode =
    (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES]
