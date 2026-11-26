import { SlashCommandBuilder } from '@discordjs/builders'
import {
    requireVoiceChannel,
    requireDJRoleInGuild,
} from '../../../utils/command/commandValidations'
import type { CommandExecuteParams } from '../../../types/CommandData'
import Command from '../../../models/Command'
import { interactionReply } from '../../../utils/general/interactionReply'
import { createErrorEmbed } from '../../../utils/general/embeds'
import { executePlayHandler } from './play/handlers/playHandler'

/**
 * `/play` picks the first match for a song name, which is wrong when the name
 * is ambiguous. `/search` lists the matches while the user types (see
 * handlers/trackSuggestions.ts) and plays the one they pick. A choice carries
 * its Spotify track URL in the `query` option, so execution is the `/play`
 * path unchanged; text sent without picking plays like `/play` would.
 */
export default new Command({
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for a song and pick which result to play')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription(
                    'Type a song name, then pick one of the results',
                )
                .setRequired(true)
                .setAutocomplete(true),
        ),
    category: 'music',
    execute: async (params: CommandExecuteParams): Promise<void> => {
        if (!params.interaction.guildId) {
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
        if (!(await requireDJRoleInGuild(params.interaction, 'preceding')))
            return

        await executePlayHandler(params)
    },
})
