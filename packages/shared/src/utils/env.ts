import { warnLog } from './general/log'

export interface ParseIntEnvOptions {
    min?: number
    max?: number
}

/**
 * Parse a numeric environment variable safely with validation.
 *
 * Returns the fallback value (or throws if no fallback) when:
 * - The env var is undefined/empty
 * - Parsing results in NaN
 * - The parsed value is not finite
 * - The value is outside [min, max] bounds
 *
 * Always uses radix 10 for parseInt.
 *
 * @param name - Environment variable name (for logging)
 * @param fallback - Default value if parsing fails
 * @param options - Validation options (min, max)
 * @returns Parsed integer or fallback
 */
export function parseIntEnv(
    name: string,
    fallback: number,
    options?: ParseIntEnvOptions,
): number {
    const value = process.env[name]

    // Treat undefined or empty string as fallback
    if (!value || value.trim() === '') {
        return fallback
    }

    // Reject anything that isn't a plain base-10 integer — parseInt alone
    // would silently accept trailing garbage ("80abc" → 80) and mask typos
    if (!/^[+-]?\d+$/.test(value.trim())) {
        warnLog({
            message: `Invalid numeric env var: ${name}="${value}" is not an integer, using fallback ${fallback}`,
        })
        return fallback
    }

    const parsed = parseInt(value, 10)

    // Check for NaN or non-finite
    if (!Number.isFinite(parsed)) {
        warnLog({
            message: `Invalid numeric env var: ${name}="${value}" → NaN, using fallback ${fallback}`,
        })
        return fallback
    }

    // Check bounds
    const { min, max } = options ?? {}
    if (min !== undefined && parsed < min) {
        warnLog({
            message: `Env var ${name}=${parsed} below minimum ${min}, using fallback ${fallback}`,
        })
        return fallback
    }

    if (max !== undefined && parsed > max) {
        warnLog({
            message: `Env var ${name}=${parsed} above maximum ${max}, using fallback ${fallback}`,
        })
        return fallback
    }

    return parsed
}
