import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    escapeMarkdown,
} from 'discord.js'
import { EmbedBuilder } from '@discordjs/builders'
import type { TFunction } from 'i18next'
import { COLOR } from '@lucky/shared/constants'
import type { RecapPayload } from '@lucky/shared/services'
import { buildRecapMixButton } from '../../functions/music/recapMixButton'
import { RECAP_OFF_BUTTON_ID } from '../../functions/music/recapOffButton'

const NAME_LIMIT = 60
const MAX_ARTISTS = 3

/** Artist names are untrusted: no newlines, no markdown, bounded length. */
function safeName(name: string): string {
    const oneLine = name.replace(/[\r\n]+/g, ' ')
    const clipped =
        oneLine.length > NAME_LIMIT
            ? `${oneLine.slice(0, NAME_LIMIT - 1)}…`
            : oneLine
    return escapeMarkdown(clipped)
}

/**
 * The comeback card: posted once when an opted-in guild has a quiet week
 * after an active month. It names what the guild played (never who) and puts
 * the mix one click away. `recap` covers the comeback window, not the week.
 */
export function buildComebackEmbed(
    recap: RecapPayload,
    t: TFunction,
): EmbedBuilder {
    const artists = recap.topArtists
        .slice(0, MAX_ARTISTS)
        .map((artist) => `**${safeName(artist.name)}**`)
        .join(', ')
    return new EmbedBuilder()
        .setColor(COLOR.LUCKY_PURPLE)
        .setTitle(t('music.recap.comebackTitle'))
        .setDescription(
            artists
                ? t('music.recap.comebackBody', { artists })
                : t('music.recap.comebackBodyNoArtists'),
        )
        .setFooter({ text: `Lucky · ${t('music.recap.offHint')}` })
}

/** Mix and off only: a reminder should not also ask for votes or invites. */
export function buildComebackRow(
    t: TFunction,
): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        buildRecapMixButton(t),
        new ButtonBuilder()
            .setCustomId(RECAP_OFF_BUTTON_ID)
            .setLabel(t('music.recap.offButton'))
            .setEmoji('🔕')
            .setStyle(ButtonStyle.Secondary),
    )
}
