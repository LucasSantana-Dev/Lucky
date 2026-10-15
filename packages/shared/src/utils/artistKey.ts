/**
 * Storage key for userArtistPreference.artistKey, shared by every writer
 * (bot feedback, backend preferred-artists API) and by the autoplay lookups,
 * so a block or preference saved for "Björk" matches a "Björk" candidate.
 *
 * Unicode letters and digits are kept ("björk", "米津玄師"); everything else
 * is dropped. Rows written before this rule used an ASCII-only key ("bjrk"),
 * see legacyArtistKey.
 */
export function normalizeArtistKey(name: string): string {
    return name
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}]+/gu, '')
}

/** The old ASCII-only key. Only used to find rows stored before the Unicode rule. */
export function legacyArtistKey(name: string): string {
    return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
}

/** Current key first, then the legacy key when it differs. Never returns an empty key. */
export function artistKeyVariants(name: string): string[] {
    const key = normalizeArtistKey(name)
    const legacy = legacyArtistKey(key)
    return [key, legacy].filter((k, i, all) => k !== '' && all.indexOf(k) === i)
}

/** True when the set holds the artist under its current or legacy key. */
export function hasArtistKey(keys: ReadonlySet<string>, name: string): boolean {
    return artistKeyVariants(name).some((k) => keys.has(k))
}
