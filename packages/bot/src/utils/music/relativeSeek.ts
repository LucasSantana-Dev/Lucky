import type { SlashCommandBuilder } from '@discordjs/builders'
import type { GuildQueue } from 'discord-player'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandExecuteParams } from '../../types/CommandData'
import { acknowledgeAndTranslate } from '../../i18n/acknowledgeAndTranslate'
import { resolveGuildQueue } from '../../services/musicManagement/queueResolver'
import {
    requireCurrentTrack,
    requireDJRoleInGuild,
    requireIsPlaying,
    requireQueue,
    requireSameVoiceChannel,
} from '../command/commandValidations'
import { interactionReply } from '../general/interactionReply'
import { buildCommandTrackEmbed } from '../general/responseEmbeds'

export const RELATIVE_SEEK_DEFAULT_SECONDS = 10
export const RELATIVE_SEEK_MAX_SECONDS = 600
// Seeking into the last second ends the track; /skip is the command for that.
const END_MARGIN_MS = 1000

/** The optional `seconds` option shared by `/forward` and `/rewind`. */
export function withSecondsOption(
    builder: SlashCommandBuilder,
    description: string,
) {
    return builder.addIntegerOption((option) =>
        option
            .setName('seconds')
            .setDescription(description)
            .setMinValue(1)
            .setMaxValue(RELATIVE_SEEK_MAX_SECONDS),
    )
}

function formatMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** The checks `/seek` runs, in the same order. Each one replies when it fails. */
async function mayControlPlayback(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    return (
        (await requireSameVoiceChannel(queue, interaction)) &&
        (await requireDJRoleInGuild(interaction, 'requireSameVoiceChannel')) &&
        (await requireQueue(queue, interaction)) &&
        (await requireCurrentTrack(queue, interaction)) &&
        (await requireIsPlaying(queue, interaction))
    )
}

/**
 * Moves the playing track forward or back by the `seconds` option (10 when
 * left out), under the same checks as `/seek`. Rewinding past the start goes
 * to 0:00; forwarding past the end is refused.
 */
export async function seekRelative(
    { client, interaction }: CommandExecuteParams,
    direction: 'forward' | 'rewind',
): Promise<void> {
    const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
    if (!(await mayControlPlayback(queue, interaction))) return

    const t = await acknowledgeAndTranslate(interaction)
    const refuse = (content: string) =>
        interactionReply({ interaction, content: { content, ephemeral: true } })

    const track = queue?.currentTrack
    if (!queue || !track?.durationMS) {
        await refuse(t('music.messages.seekUnsupported'))
        return
    }

    const seconds =
        interaction.options.getInteger('seconds') ??
        RELATIVE_SEEK_DEFAULT_SECONDS
    const position = queue.node.getTimestamp()?.current.value ?? 0
    const step = seconds * 1000
    const target =
        direction === 'forward' ? position + step : Math.max(0, position - step)

    if (target > track.durationMS - END_MARGIN_MS) {
        await refuse(t('music.messages.forwardPastEnd'))
        return
    }

    await queue.node.seek(target)

    await interactionReply({
        interaction,
        content: {
            embeds: [
                buildCommandTrackEmbed(
                    track,
                    t(
                        direction === 'forward'
                            ? 'music.messages.statusForwarded'
                            : 'music.messages.statusRewound',
                        { time: formatMs(target) },
                    ),
                    interaction.user,
                    'seeked',
                ),
            ],
        },
    })
}
