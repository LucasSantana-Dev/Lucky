import { EmbedBuilder } from '@discordjs/builders'
import { escapeMarkdown } from 'discord.js'
import type { TFunction } from 'i18next'
import { COLOR } from '@lucky/shared/constants'
import type { RecapPayload } from '@lucky/shared/services'

const FIELD_LIMIT = 1024
const LINE_LIMIT = 90

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function day(iso: string): string {
    return iso.slice(0, 10)
}

function listened(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/** Track metadata is untrusted: a newline would forge an extra ranked entry. */
function oneLine(text: string): string {
    return text.replace(/[\r\n]+/g, ' ')
}

function rankedLines(items: Array<{ label: string; plays: number }>): string {
    const text = items
        .map(
            (item, i) =>
                `**${i + 1}.** ${clip(escapeMarkdown(oneLine(item.label)), LINE_LIMIT)} · ×${item.plays}`,
        )
        .join('\n')
    return clip(text, FIELD_LIMIT)
}

/**
 * The text recap (#2678). It is also the permanent fallback for the
 * `lucky-render` card, so it shows everything the card will. Names tracks and
 * artists, never who played them.
 */
export function buildRecapEmbed(
    recap: RecapPayload,
    t: TFunction,
): EmbedBuilder {
    const autoplayPercent =
        recap.plays > 0
            ? Math.round((recap.autoplayPlays / recap.plays) * 100)
            : 0

    const fields = [
        {
            name: t('music.recap.playsName'),
            value: t('music.recap.playsValue', {
                plays: recap.plays,
                skips: recap.skips,
            }),
            inline: true,
        },
        {
            name: t('music.recap.listenedName'),
            value: listened(recap.listenedSeconds),
            inline: true,
        },
        {
            name: t('music.recap.autoplayName'),
            value: t('music.recap.autoplayValue', { percent: autoplayPercent }),
            inline: true,
        },
    ]
    if (recap.topTracks.length > 0) {
        fields.push({
            name: t('music.recap.topTracksName'),
            value: rankedLines(
                recap.topTracks.map((track) => ({
                    label: `${track.title} (${track.author})`,
                    plays: track.plays,
                })),
            ),
            inline: false,
        })
    }
    if (recap.topArtists.length > 0) {
        fields.push({
            name: t('music.recap.topArtistsName'),
            value: rankedLines(
                recap.topArtists.map((artist) => ({
                    label: artist.name,
                    plays: artist.plays,
                })),
            ),
            inline: false,
        })
    }

    return new EmbedBuilder()
        .setColor(COLOR.LUCKY_PURPLE)
        .setTitle(`📅 ${t('music.recap.title')}`)
        .setDescription(
            t('music.recap.period', {
                from: day(recap.from),
                to: day(recap.to),
            }),
        )
        .addFields(fields)
        .setFooter({ text: 'Lucky' })
}
