import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { createInfoEmbed } from '../../../utils/general/embeds'

const BOT_VERSION = process.env.npm_package_version ?? 'unknown'

export default new Command({
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Shows the current bot version'),
    category: 'general',
    execute: async ({ interaction }) => {
        await interaction.deferReply({ ephemeral: true })
        await interaction.editReply({
            embeds: [createInfoEmbed('Bot Version', `v${BOT_VERSION}`)],
        })
    },
})
