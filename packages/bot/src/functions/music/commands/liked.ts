import { SlashCommandBuilder } from '@discordjs/builders'
import { escapeMarkdown, MessageFlags } from 'discord.js'
import type { TFunction } from 'i18next'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createInfoEmbed } from '../../../utils/general/embeds'
import {
    requireDJRoleInGuild,
    requireGuild,
    requireSameVoiceChannel,
    requireVoiceChannel,
} from '../../../utils/command/commandValidations'
import { translatorForInteraction } from '../../../i18n/translatorForInteraction'
import { createQueue, queueConnect } from '../../../handlers/queueHandler'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import {
    LIKED_TRACKS_MAX,
    listLikedTracks,
    queueLikedTracks,
    unlikeTrack,
} from '../../../services/likedTracks'

const LIST_SHOWN = 15

type Params = CommandExecuteParams & { t: TFunction }

/** Provider text, safe inside a Markdown line and a link label. */
function plain(text: string): string {
    return escapeMarkdown(text).replace(/[[\]]/g, '\\$&')
}

async function showList({ interaction, t }: Params): Promise<void> {
    const reply = (content: string) =>
        interactionReply({ interaction, content: { content, ephemeral: true } })
    const library = await listLikedTracks(interaction.user.id, LIST_SHOWN)
    if (!library) {
        await reply(t('music.liked.unavailable'))
        return
    }
    const { tracks, total } = library
    if (total === 0) {
        await reply(t('music.liked.empty'))
        return
    }
    const lines = tracks.map(
        (track, index) =>
            `${index + 1}. [${plain(track.title)}](${track.url}), ${plain(track.author)}`,
    )
    if (total > tracks.length) {
        lines.push(t('music.liked.listMore', { count: total - tracks.length }))
    }
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createInfoEmbed(
                    t('music.liked.listTitle', { count: total }),
                    lines.join('\n'),
                ),
            ],
            ephemeral: true,
        },
    })
}

async function removeOne({ interaction, t }: Params): Promise<void> {
    const removed = await unlikeTrack(
        interaction.user.id,
        interaction.options.getString('song', true),
    )
    await interactionReply({
        interaction,
        content: {
            content: removed
                ? t('music.liked.removed', { title: removed.title })
                : t('music.liked.notFound'),
            ephemeral: true,
        },
    })
}

async function playLiked({ client, interaction, t }: Params): Promise<void> {
    const guildId = interaction.guildId ?? ''
    const reply = (content: string) =>
        interactionReply({ interaction, content: { content } })

    // Read before joining, so an empty list never leaves Lucky in the channel.
    const library = await listLikedTracks(interaction.user.id, LIKED_TRACKS_MAX)
    if (!library) {
        await reply(t('music.liked.unavailable'))
        return
    }
    if (library.total === 0) {
        await reply(t('music.liked.empty'))
        return
    }

    const existing = resolveGuildQueue(client, guildId).queue
    const queue = existing ?? (await createQueue({ client, interaction }))
    try {
        await queueConnect({ queue, interaction })
    } catch {
        await reply(t('music.liked.connectFailed'))
        return
    }

    const { added, missed } = await queueLikedTracks(
        queue,
        interaction.user,
        library.tracks,
    )
    if (added === 0) {
        // A queue made for this command has nothing to play: leave again.
        if (!existing && !queue.deleted) queue.delete()
        await reply(t('music.liked.noneQueued'))
        return
    }
    const parts = [t('music.liked.queued', { count: added })]
    if (missed > 0)
        parts.push(t('music.liked.queuedSkipped', { count: missed }))
    await reply(parts.join(' '))
}

/**
 * The member's own liked songs (saved with `/like`): play a shuffled batch,
 * list them, or remove one. The list is the same in every guild.
 */
export default new Command({
    data: new SlashCommandBuilder()
        .setName('liked')
        .setDescription('❤️ Your liked songs')
        .addSubcommand((subcommand) =>
            subcommand
                .setName('play')
                .setDescription('Add your liked songs to the queue, shuffled'),
        )
        .addSubcommand((subcommand) =>
            subcommand.setName('list').setDescription('Show your liked songs'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('remove')
                .setDescription('Remove a song from your liked songs')
                .addStringOption((option) =>
                    option
                        .setName('song')
                        .setDescription('The song to remove')
                        .setRequired(true)
                        .setAutocomplete(true),
                ),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        if (!(await requireGuild(interaction))) return
        const subcommand = interaction.options.getSubcommand()

        if (subcommand === 'play') {
            if (!(await requireVoiceChannel(interaction))) return
            // With music already on, only the members listening may add to it.
            const playing = resolveGuildQueue(
                client,
                interaction.guildId ?? '',
            ).queue
            if (
                playing &&
                !(await requireSameVoiceChannel(playing, interaction))
            )
                return
            if (
                !(await requireDJRoleInGuild(
                    interaction,
                    'requireVoiceChannel',
                ))
            )
                return
            // Looking the songs up can outlast Discord's 3 s window.
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply()
            }
            const t = await translatorForInteraction(interaction)
            await playLiked({ client, interaction, t })
            return
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        const t = await translatorForInteraction(interaction)
        if (subcommand === 'remove') {
            await removeOne({ client, interaction, t })
            return
        }
        await showList({ client, interaction, t })
    },
})
