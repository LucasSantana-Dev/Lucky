import crypto from 'crypto'

/**
 * Timing-safe comparison of API keys.
 * Hashes both values before comparison to avoid length-mismatch timing leaks.
 * @param providedKey - The key provided in the request (e.g., from header)
 * @param expectedKey - The expected key from environment
 * @returns true if keys match, false otherwise
 */
export function timingSafeKeyCompare(
    providedKey: string | undefined,
    expectedKey: string | undefined,
): boolean {
    // If either is missing, they don't match
    if (!providedKey || !expectedKey) {
        return false
    }

    // Hash both values to avoid length-mismatch timing leaks
    const providedHash = crypto.createHash('sha256').update(providedKey).digest()
    const expectedHash = crypto.createHash('sha256').update(expectedKey).digest()

    // Use timingSafeEqual for constant-time comparison
    try {
        return crypto.timingSafeEqual(providedHash, expectedHash)
    } catch {
        // timingSafeEqual throws if lengths don't match (shouldn't happen with hashes)
        return false
    }
}
