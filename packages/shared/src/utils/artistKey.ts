/**
 * Storage key for userArtistPreference.artistKey, shared by every writer
 * (bot feedback, backend preferred-artists API) and by the autoplay lookups,
 * so a block or preference saved for "Björk" matches a "Björk" candidate.
 *
 * Unicode letters, combining marks and digits are kept ("björk", "米津玄師",
 * "कु"); everything else is dropped. Rows written before this rule used an ASCII-only key ("bjrk"),
 * see legacyArtistKey.
 */
export function normalizeArtistKey(name: string): string {
    return name
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{M}\p{N}]+/gu, '')
}

/** The old ASCII-only key. Only used to find rows stored before the Unicode rule. */
export function legacyArtistKey(name: string): string {
    return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
}

/**
 * Current key first, then the legacy keys when they differ. The legacy key is
 * taken from both the raw and the normalized spelling, since NFD "Björk" was
 * stored as "bjork" and NFC "Björk" as "bjrk". Never returns an empty key.
 */
export function artistKeyVariants(name: string): string[] {
    const key = normalizeArtistKey(name)
    return [key, legacyArtistKey(name), legacyArtistKey(key)].filter(
        (k, i, all) => k !== '' && all.indexOf(k) === i,
    )
}

/**
 * Keys of legacy rows that belong to the artist with this key: a row only
 * counts when its own artistName normalizes to the same key, so an unrelated
 * artist whose key happens to equal the ASCII form is left alone.
 */
export function staleLegacyKeys(
    rows: ReadonlyArray<{ artistKey: string; artistName: string }>,
    key: string,
    toKey: (name: string) => string = normalizeArtistKey,
): string[] {
    return rows
        .filter((r) => r.artistKey !== key && toKey(r.artistName) === key)
        .map((r) => r.artistKey)
}

/** True when the set holds the artist under its current or legacy key. */
export function hasArtistKey(keys: ReadonlySet<string>, name: string): boolean {
    return artistKeyVariants(name).some((k) => keys.has(k))
}
