/**
 * Authentication and authorization error codes
 */

export const AUTH_ERROR_CODES = {
    AUTH_TOKEN_INVALID: 'ERR_AUTH_TOKEN_INVALID',
    AUTH_TOKEN_EXPIRED: 'ERR_AUTH_TOKEN_EXPIRED',
    AUTH_PERMISSION_DENIED: 'ERR_AUTH_PERMISSION_DENIED',
} as const

export type AuthErrorCode =
    (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]
