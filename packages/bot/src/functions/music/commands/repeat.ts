import { SlashCommandBuilder } from '@discordjs/builders'
import { QueueRepeatMode } from 'discord-player'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createSuccessEmbed } from '../../../utils/general/embeds'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    requireQueue,
    requireSameVoiceChannel,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'
import { resumeAutoplay } from '../../../handlers/player/autoplayFailureStreak'

const REPEAT_MODES: Record<
    string,
    { mode: QueueRepeatMode; description: string }
> = {
    track: {
        mode: QueueRepeatMode.TRACK,
        description: 'Repeating current song **until turned off**',
    },
    queue: {
        mode: QueueRepeatMode.QUEUE,
        description: 'Repeating queue **until turned off**',
    },
    infinite: {
        mode: QueueRepeatMode.AUTOPLAY,
        description: '**Infinite** repeat activated (continuous autoplay)',
    },
}

const REPEAT_OFF = {
    mode: QueueRepeatMode.OFF,
    description: 'Repeat **turned off**',
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('🔁 Set the repeat mode.')
        .addStringOption((option) =>
            option
                .setName('mode')
                .setDescription('Repeat type')
                .setRequired(true)
                .addChoices(
                    { name: 'off - Turn off', value: 'off' },
                    { name: 'track - Repeat current song', value: 'track' },
                    { name: 'queue - Repeat queue', value: 'queue' },
                    {
                        name: 'infinite - Repeat infinitely',
                        value: 'infinite',
                    },
                ),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams) => {
        const { queue } = resolveGuildQueue(client, interaction.guildId ?? '')
        if (!(await requireSameVoiceChannel(queue, interaction))) return
        const mode = interaction.options.getString('mode', true)

        if (!(await requireQueue(queue, interaction))) return

        const guildId = interaction.guildId ?? ''
        const { mode: repeatMode, description } =
            REPEAT_MODES[mode] ?? REPEAT_OFF

        queue?.setRepeatMode(repeatMode)
        if (repeatMode === QueueRepeatMode.AUTOPLAY) resumeAutoplay(guildId)

        await interactionReply({
            interaction,
            content: {
                embeds: [createSuccessEmbed('🔁 Repeat mode', description)],
            },
        })
    },
})
