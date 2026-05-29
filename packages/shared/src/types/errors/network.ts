/** Error codes for network and API failures. */
export const NETWORK_ERROR_CODES = {
    NETWORK_TIMEOUT: 'ERR_NETWORK_TIMEOUT',
    NETWORK_CONNECTION_FAILED: 'ERR_NETWORK_CONNECTION_FAILED',
    API_RATE_LIMITED: 'ERR_API_RATE_LIMITED',
    API_SERVICE_UNAVAILABLE: 'ERR_API_SERVICE_UNAVAILABLE',
} as const

/** Type representing network error codes. */
export type NetworkErrorCode =
    (typeof NETWORK_ERROR_CODES)[keyof typeof NETWORK_ERROR_CODES]
