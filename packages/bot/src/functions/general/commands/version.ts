import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../models/Command'
import { createInfoEmbed } from '../../../utils/general/embeds'

function resolveVersion(): string {
    const semver = process.env.npm_package_version
    if (semver) return `v${semver}`
    const sha = process.env.COMMIT_SHA
    if (sha) return `commit ${sha.slice(0, 7)}`
    return 'unknown'
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
