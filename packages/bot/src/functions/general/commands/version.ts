import { SlashCommandBuilder } from '@discordjs/builders'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'
import Command from '../../../models/Command'
import { createInfoEmbed } from '../../../utils/general/embeds'

async function readVersion(): Promise<string> {
    const dirName = path.dirname(fileURLToPath(import.meta.url))
    const pkgPath = path.resolve(dirName, '../../../../package.json')
    const rl = createInterface({ input: createReadStream(pkgPath) })

    try {
        for await (const line of rl) {
            const match = line.match(/"version"\s*:\s*"([^"]+)"/)
            if (match) return match[1]
        }
        return 'unknown'
    } finally {
        rl.close()
    }
}

export default new Command({
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Shows the current bot version'),
    category: 'general',
    execute: async ({ interaction }) => {
        const version = await readVersion()
        await interaction.reply({
            embeds: [createInfoEmbed('Bot Version', `v${version}`)],
            ephemeral: true,
        })
    },
})
