import { SlashCommandBuilder } from '@discordjs/builders'
import { MessageFlags } from 'discord.js'
import { debugLog } from '@lucky/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Command from '../../../models/Command'
import { createInfoEmbed } from '../../../utils/general/embeds'

function resolveVersion(): string {
    const runtimeVersion = process.env.npm_package_version
    if (runtimeVersion) return `v${runtimeVersion}`

    try {
        const packageJson = JSON.parse(
            readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
        ) as {
            version?: string
        }
        if (packageJson.version) return `v${packageJson.version}`
    } catch (error) {
        debugLog({
            message: 'version: failed to read package.json, using fallback',
            data: { error: String(error) },
        })
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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await interactionReply({
            interaction,
            content: { embeds: [createInfoEmbed('Bot Version', resolveVersion())] },
        })
    },
})
