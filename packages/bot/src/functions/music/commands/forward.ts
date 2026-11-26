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
            .setName('forward')
            .setDescription('⏩ Jump ahead in the current song'),
        'Seconds to jump ahead (10 when left out)',
    ),
    category: 'music',
    execute: (params: CommandExecuteParams) => seekRelative(params, 'forward'),
})
