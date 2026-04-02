import { SlashCommandBuilder } from '@discordjs/builders'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Command from '../../../models/Command'
import { createInfoEmbed } from '../../../utils/general/embeds'

function resolveVersion(): string {
    try {
        const packageJson = JSON.parse(
            readFileSync(join(process.cwd(), 'packages/bot/package.json'), 'utf8'),
        ) as {
            version?: string
        }
        if (packageJson.version) return `v${packageJson.version}`
    } catch {
    }

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
