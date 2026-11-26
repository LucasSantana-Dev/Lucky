import { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildQueue, Track } from 'discord-player'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireDJRoleInGuild,
    requireQueue,
    requireSameVoiceChannel,
} from '../../../utils/command/commandValidations'
import { acknowledgeAndTranslate } from '../../../i18n/acknowledgeAndTranslate'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import {
    cleanAuthor,
    cleanTitle,
} from '../../../utils/music/searchQueryCleaner'
import { normalizeText } from '../../../utils/music/trackNormalization'

/**
 * Two entries are the same song when their link matches, or their cleaned
 * title and full artist credit do. Cleaned, so "Creep (Remaster)" by
 * "Radiohead - Topic" is "Creep" by "Radiohead". The whole credit, so two
 * collaborations that share a title and a lead artist stay apart; and no
 * title and artist identity for an entry missing either, so entries with
 * blank metadata never match each other.
 */
function identities(track: Track): string[] {
    const title = normalizeText(cleanTitle(track.title ?? ''))
    const author = normalizeText(cleanAuthor(track.author ?? ''))
    return [
        track.url ? `url:${track.url}` : '',
        title && author ? `key:${title}::${author}` : '',
    ].filter(Boolean)
}

/**
 * Removes every upcoming track that repeats an earlier one or the song that
 * is playing, keeping the first of each. Returns how many were removed.
 */
export function removeDuplicateTracks(queue: GuildQueue): number {
    const seen = new Set<string>(
        queue.currentTrack ? identities(queue.currentTrack) : [],
    )
    let removed = 0
    for (const track of queue.tracks.toArray()) {
        const ids = identities(track)
        if (ids.some((id) => seen.has(id))) {
            queue.node.remove(track)
            removed += 1
            continue
        }
        for (const id of ids) seen.add(id)
    }
    return removed
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('removedupes')
        .setDescription('🧹 Remove repeated songs from the queue'),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireSameVoiceChannel(queue, interaction))) return
        if (
            !(await requireDJRoleInGuild(
                interaction,
                'requireSameVoiceChannel',
            ))
        )
            return
        if (!(await requireQueue(queue, interaction)) || !queue) return

        const t = await acknowledgeAndTranslate(interaction)
        const removed = removeDuplicateTracks(queue)
        await interactionReply({
            interaction,
            content: {
                content:
                    removed > 0
                        ? t('music.queue.dupesRemoved', { count: removed })
                        : t('music.queue.noDupes'),
            },
        })
    },
})
