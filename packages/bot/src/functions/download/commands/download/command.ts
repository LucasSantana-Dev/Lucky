import { SlashCommandBuilder } from '@discordjs/builders'
import Command from '../../../../models/Command'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { DownloadCommandService } from './service'
import type { DownloadOptions, DownloadResult } from './types'

const downloadService = new DownloadCommandService()

export default new Command({
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('📥 Download media from URLs')
        .addStringOption((option) =>
            option
                .setName('url')
                .setDescription('The URL to download media from')
                .setRequired(true),
        ),
    category: 'download',
    execute: async ({ interaction }) => {
        const url = interaction.options.getString('url', true)

        await interactionReply({
            interaction,
            content: {
                content: '⏳ Processing download...',
            },
        })

        try {
            const options: DownloadOptions = {
                url,
                format: 'video',
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            }

            const result: DownloadResult =
                await downloadService.executeDownload(options)

            if (result.success) {
                await interactionReply({
                    interaction,
                    content: {
                        content: `✅ Downloaded: ${result.fileName} (${formatFileSize(result.fileSize)})`,
                    },
                })
            } else {
                await interactionReply({
                    interaction,
                    content: {
                        content: `❌ Download failed: ${result.error}`,
                        ephemeral: true,
                    },
                })
            }
        } catch (error) {
            await interactionReply({
                interaction,
                content: {
                    content:
                        '❌ An error occurred while processing the download.',
                    ephemeral: true,
                },
            })
        }
    },
})

function formatFileSize(fileSize: number | undefined): string {
    if (fileSize === undefined || fileSize <= 0) return 'Unknown'
    return `${(fileSize / 1024 / 1024).toFixed(2)} MB`
}
