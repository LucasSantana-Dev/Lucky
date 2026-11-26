import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import type { CommandExecuteParams } from '../../../types/CommandData'
import {
    seekRelative,
    withSecondsOption,
} from '../../../utils/music/relativeSeek'

export default new Command({
    data: withSecondsOption(
        new SlashCommandBuilder()
            .setName('rewind')
            .setDescription('⏪ Go back in the current song'),
        'Seconds to go back (10 when left out)',
    ),
    category: 'music',
    execute: (params: CommandExecuteParams) => seekRelative(params, 'rewind'),
})
