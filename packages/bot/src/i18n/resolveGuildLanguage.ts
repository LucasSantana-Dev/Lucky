import {
    coerceBotLanguage,
    isBotLanguage,
    DEFAULT_BOT_LANGUAGE,
    type BotLanguage,
} from '@lucky/shared/constants'

/**
 * Resolve which language Lucky replies in for one Guild.
 *
 * Order (spec D3):
 *   1. `GuildSettings.language`, when it holds a supported value
 *   2. Discord's `guild.preferredLocale`, coerced, when the Guild never chose
 *   3. `en`
 *
 * Step 2 means a Brazilian Guild gets Portuguese with zero configuration, which
 * is the whole point of not defaulting everyone to English.
 *
 * Caching exists because `GuildSettingsService.getGuildSettings` documents
 * itself as hitting the database directly on every call with no cache. Resolving
 * language per music reply would put a database round trip on the hottest path
 * in the bot. Only this one field is cached: caching the whole settings object
 * would raise staleness questions this does not need to answer.
 */

const TTL_MS = 5 * 60 * 1000

type Entry = { language: BotLanguage; expiresAt: number }

const cache = new Map<string, Entry>()

/** Injected so tests do not depend on the real clock. */
let now = (): number => Date.now()

export function __setClockForTests(fn: () => number): void {
    now = fn
}

export function __resetClockForTests(): void {
    now = () => Date.now()
}

/**
 * Drop a Guild's cached language. MUST be called whenever
 * `GuildSettings.language` is written, or an admin changes the language and
 * sees no effect for up to the TTL.
 */
export function invalidateGuildLanguage(guildId: string): void {
    cache.delete(guildId)
}

export function clearGuildLanguageCache(): void {
    cache.clear()
}

export type GuildLanguageSources = {
    /** Raw `GuildSettings.language`. Unvalidated: rows predate the constraint. */
    settingsLanguage?: unknown
    /** Raw Discord `guild.preferredLocale`, e.g. `pt-BR`, `es-ES`, `en-GB`. */
    preferredLocale?: unknown
}

/**
 * Pure resolution, no cache and no IO. Exported so the ordering rules are
 * testable on their own.
 */
export function pickLanguage(sources: GuildLanguageSources): BotLanguage {
    // Only an EXACT supported tag counts as a deliberate choice. A row holding
    // `pt` or `es-ES` was not written by this feature's validated path, so it
    // falls through to coercion rather than being trusted as-is.
    if (isBotLanguage(sources.settingsLanguage)) {
        return sources.settingsLanguage
    }
    if (
        typeof sources.settingsLanguage === 'string' &&
        sources.settingsLanguage.trim() !== ''
    ) {
        return coerceBotLanguage(sources.settingsLanguage)
    }
    if (
        typeof sources.preferredLocale === 'string' &&
        sources.preferredLocale.trim() !== ''
    ) {
        return coerceBotLanguage(sources.preferredLocale)
    }
    return DEFAULT_BOT_LANGUAGE
}

/**
 * Cached resolution. `load` is only invoked on a miss.
 *
 * A `guildId` of null/undefined means there is no Guild to resolve against:
 * music commands guard this case explicitly (album.ts, artist.ts, queryUtils.ts,
 * playHandler.ts), and those paths get the default.
 */
export async function resolveGuildLanguage(
    guildId: string | null | undefined,
    load: () => Promise<GuildLanguageSources>,
): Promise<BotLanguage> {
    if (!guildId) return DEFAULT_BOT_LANGUAGE

    const hit = cache.get(guildId)
    if (hit && hit.expiresAt > now()) return hit.language

    let language: BotLanguage
    try {
        language = pickLanguage(await load())
    } catch {
        // A settings lookup that fails must not break a music reply. Fall back
        // and do NOT cache, so the next call retries rather than pinning
        // English for the whole TTL.
        return DEFAULT_BOT_LANGUAGE
    }

    cache.set(guildId, { language, expiresAt: now() + TTL_MS })
    return language
}
