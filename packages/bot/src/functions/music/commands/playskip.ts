import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import { executePlayAtTop } from './play/queryUtils'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('playskip')
        .setDescription('Add a track to the top of the queue and skip the current track')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Song name, artist, YouTube URL, or Spotify URL')
                .setRequired(true),
        ),
    category: 'music',
    execute: async ({ client, interaction }: CommandExecuteParams): Promise<void> => {
        await executePlayAtTop({ client, interaction, skipCurrent: true, commandName: 'playskip' })
    },
})
