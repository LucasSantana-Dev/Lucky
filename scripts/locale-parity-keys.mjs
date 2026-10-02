export function flattenKeys(obj, prefix = '') {
    const out = []
    for (const [key, value] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            out.push(...flattenKeys(value, full))
        } else {
            out.push(full)
        }
    }
    return out
}

export function diffKeySets(reference, other) {
    return {
        missing: [...reference].filter((key) => !other.has(key)),
        extra: [...other].filter((key) => !reference.has(key)),
    }
}
