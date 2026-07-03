import crypto from 'crypto'

/**
 * Timing-safe comparison for API keys to prevent timing attacks.
 * Returns true only if both values are defined and exactly equal.
 */
export function timingSafeKeyCompare(
	provided: string | undefined,
	expected: string | undefined,
): boolean {
	// Both must be defined
	if (provided === undefined || expected === undefined) {
		return false
	}

	// Use timing-safe comparison to prevent timing attacks
	try {
		return crypto.timingSafeEqual(
			Buffer.from(provided),
			Buffer.from(expected),
		)
	} catch {
		// timingSafeEqual throws if lengths don't match
		return false
	}
}
