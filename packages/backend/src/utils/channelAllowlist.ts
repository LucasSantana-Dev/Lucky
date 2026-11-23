/**
 * Reads a comma-separated list of Discord channel ids from an env var.
 * An unset or blank var yields an empty set, which callers treat as
 * "not configured" and reject (fail closed).
 */
export function readChannelAllowlist(envName: string): Set<string> {
    const raw = process.env[envName]
    if (!raw?.trim()) {
        return new Set()
    }
    return new Set(
        raw
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
    )
}
