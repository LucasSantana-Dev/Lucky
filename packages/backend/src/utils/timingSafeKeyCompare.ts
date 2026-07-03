import crypto from 'crypto'

/**
 * Timing-safe comparison of API keys.
 * Both values are zero-padded to a common byte length so timingSafeEqual
 * always runs a full constant-time comparison; a length mismatch is folded
 * into the result afterwards instead of short-circuiting.
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

    const provided = Buffer.from(providedKey)
    const expected = Buffer.from(expectedKey)
    const length = Math.max(provided.length, expected.length)
    const providedPadded = Buffer.alloc(length)
    const expectedPadded = Buffer.alloc(length)
    provided.copy(providedPadded)
    expected.copy(expectedPadded)

    const equal = crypto.timingSafeEqual(providedPadded, expectedPadded)
    return equal && provided.length === expected.length
}
