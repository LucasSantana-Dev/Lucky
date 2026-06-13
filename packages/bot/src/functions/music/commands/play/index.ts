import { SlashCommandBuilder } from '@discordjs/builders'
import {
    requireVoiceChannel,
    requireDJRole,
} from '../../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../../types/CommandData'
import Command from '../../../../models/Command'
import { executePlayHandler } from './handlers/playHandler'
import { assertDefined } from '@lucky/shared/utils/guards'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Play music from YouTube, Spotify, or search for tracks',
        )
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription(
                    'Song name, artist, YouTube URL, or Spotify URL',
                )
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('provider')
                .setDescription('Music provider to search (default: spotify)')
                .addChoices(
                    { name: 'Spotify', value: 'spotify' },
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'SoundCloud', value: 'soundcloud' },
                )
                .setRequired(false),
        ),
    category: 'music',
    execute: async (params: CommandExecuteParams): Promise<void> => {
        if (!params.interaction.guildId) {
            const { interactionReply } = await import(
                '../../../../utils/general/interactionReply'
            )
            const { createErrorEmbed } = await import(
                '../../../../utils/general/embeds'
            )
            await interactionReply({
                interaction: params.interaction,
                content: {
                    embeds: [
                        createErrorEmbed(
                            'Error',
                            'This command can only be used in a server',
                        ),
                    ],
                    ephemeral: true,
                },
            })
            return
        }

        if (!(await requireVoiceChannel(params.interaction))) return
        if (
            !(await requireDJRole(
                params.interaction,
                assertDefined(params.interaction.guildId, 'guildId guaranteed by preceding guard'),
            ))
        )
            return

        await executePlayHandler(params)
    },
})
