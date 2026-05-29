/** Error codes for custom application errors. */
export const CUSTOM_ERROR_CODES = {
    CUSTOM_UNKNOWN_ERROR: 'ERR_CUSTOM_UNKNOWN_ERROR',
    CUSTOM_NOT_IMPLEMENTED: 'ERR_CUSTOM_NOT_IMPLEMENTED',
    CUSTOM_CONFIGURATION_ERROR: 'ERR_CUSTOM_CONFIGURATION_ERROR',
} as const

/** Type representing custom error codes. */
export type CustomErrorCode =
    (typeof CUSTOM_ERROR_CODES)[keyof typeof CUSTOM_ERROR_CODES]
