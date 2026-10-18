import { EmbedBuilder } from 'discord.js'

// Pure-utility onboarding embed (no invite/vote CTA — see ADR
// 2026-06-18-in-bot-growth). Locale is resolved by the caller via
// translatorForInteraction so Brazilian guilds get pt-BR automatically.
export function buildOnboardingEmbed(t: (key: string) => string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t('music.onboarding.title'))
        .setDescription(t('music.onboarding.description'))
        .setFooter({ text: 'Lucky' })
}
