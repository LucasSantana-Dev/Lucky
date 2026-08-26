/**
 * The languages Lucky can reply in, shared because three packages must agree on
 * the same set: the bot resolves it, the backend validates writes against it,
 * and the frontend renders the selector from it. A private copy in any one of
 * them drifts the first time a language is added.
 *
 * Tags match the frontend's existing i18next tags exactly
 * (`packages/frontend/src/lib/i18n.ts`). `pt-BR`, never bare `pt`.
 */
export const SUPPORTED_BOT_LANGUAGES = ['en', 'pt-BR', 'es'] as const

export type BotLanguage = (typeof SUPPORTED_BOT_LANGUAGES)[number]

export const DEFAULT_BOT_LANGUAGE: BotLanguage = 'en'

export function isBotLanguage(value: unknown): value is BotLanguage {
    return (
        typeof value === 'string' &&
        (SUPPORTED_BOT_LANGUAGES as readonly string[]).includes(value)
    )
}

/**
 * Map an arbitrary locale tag onto a supported language.
 *
 * Used for two inputs that this code does not control: a Discord
 * `guild.preferredLocale` (`pt-BR`, `es-ES`, `en-GB`, ...) and a
 * `GuildSettings.language` row written before the column was validated, which
 * can hold anything at all.
 *
 * Prefix-based on purpose: `es-ES` and `es-419` are both Spanish for our
 * purposes, and pretending to distinguish them would mean catalogues we do not
 * have. Anything unrecognised resolves to the default rather than throwing,
 * because a corrupt settings row must not break a music reply.
 */
export function coerceBotLanguage(value: unknown): BotLanguage {
    if (typeof value !== 'string') return DEFAULT_BOT_LANGUAGE
    const tag = value.trim().toLowerCase()
    if (!tag) return DEFAULT_BOT_LANGUAGE
    if (tag.startsWith('pt')) return 'pt-BR'
    if (tag.startsWith('es')) return 'es'
    if (tag.startsWith('en')) return 'en'
    return DEFAULT_BOT_LANGUAGE
}
