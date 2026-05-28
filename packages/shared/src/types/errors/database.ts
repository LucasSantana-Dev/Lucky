/** Error codes for database operations. */
export const DATABASE_ERROR_CODES = {
    DATABASE_CONNECTION_FAILED: 'ERR_DATABASE_CONNECTION_FAILED',
    DATABASE_QUERY_FAILED: 'ERR_DATABASE_QUERY_FAILED',
    DATABASE_TRANSACTION_FAILED: 'ERR_DATABASE_TRANSACTION_FAILED',
} as const

/** Type representing database error codes. */
export type DatabaseErrorCode =
    (typeof DATABASE_ERROR_CODES)[keyof typeof DATABASE_ERROR_CODES]
