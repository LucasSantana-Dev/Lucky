import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { createInfoEmbed } from '../../../utils/general/embeds'
import { version } from '../../../../package.json'

function resolveVersion(): string {
    return `v${version}`
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Shows the current bot version'),
    category: 'general',
    execute: async ({ interaction }) => {
        await interaction.deferReply({ ephemeral: true })
        await interaction.editReply({
            embeds: [createInfoEmbed('Bot Version', resolveVersion())],
        })
    },
})
