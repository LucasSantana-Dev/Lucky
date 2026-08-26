import type { TFunction } from 'i18next'
import { guildSettingsService } from '@lucky/shared/services'
import { translatorFor } from './index'
import { resolveGuildLanguage } from './resolveGuildLanguage'

/**
 * The bridge between an incoming Discord interaction and a language-bound
 * translator. This is the ONLY thing a command should need to call.
 *
 * `guildId` may be null: music commands guard the no-Guild case explicitly, and
 * `resolveGuildLanguage` returns the default for it without touching the
 * database.
 *
 * The settings read is wrapped in the resolver's cache, so a Guild costs one
 * query per TTL rather than one per reply.
 */
type LanguageInteraction = {
    guildId: string | null
    guild?: { preferredLocale?: string | null } | null
}

export async function translatorForInteraction(
    interaction: LanguageInteraction,
): Promise<TFunction> {
    const language = await resolveGuildLanguage(
        interaction.guildId,
        async () => ({
            settingsLanguage: interaction.guildId
                ? (
                      await guildSettingsService.getGuildSettings(
                          interaction.guildId,
                      )
                  )?.language
                : undefined,
            preferredLocale: interaction.guild?.preferredLocale ?? undefined,
        }),
    )
    return translatorFor(language)
}
