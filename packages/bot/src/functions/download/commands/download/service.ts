import { AttachmentBuilder, type ColorResolvable } from 'discord.js'
import { errorLog } from '@lukbot/shared/utils'
import { createErrorEmbed } from '../../../../utils/download/downloadHelpers'
import { createEmbed, EMBED_COLORS } from '../../../../utils/general/embeds'
import { DownloadValidator } from './validator'
import { DownloadProcessor } from './processor'
import type { DownloadOptions, DownloadResult } from './types'
import { featureToggleService } from '@lukbot/shared/services'

/**
 * Format file size for display
 */
function formatFileSize(fileSize: number | undefined): string {
    if (fileSize === undefined || fileSize <= 0) {
        return 'Unknown'
    }
    return `${(fileSize / 1024 / 1024).toFixed(2)} MB`
}

/**
 * Format duration for display
 */
function formatDuration(duration: number | undefined): string {
    if (duration === undefined || duration <= 0) {
        return 'Unknown'
    }
    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Create success embed for download
 */
function createSuccessEmbed(result: DownloadResult, url: string): unknown {
    return createEmbed({
        title: 'Download Complete',
        description: `Successfully downloaded from ${url}`,
        color: EMBED_COLORS.SUCCESS as ColorResolvable,
        fields: [
            {
                name: 'File Size',
                value: formatFileSize(result.fileSize),
                inline: true,
            },
            {
                name: 'Duration',
                value: formatDuration(result.duration),
                inline: true,
            },
        ],
        thumbnail: 'https://cdn.discordapp.com/emojis/1234567890123456789.png',
    })
}

/**
 * Download command service
 */
export class DownloadCommandService {
    private readonly validator: DownloadValidator
    private readonly processor: DownloadProcessor

    constructor() {
        this.validator = new DownloadValidator()
        this.processor = new DownloadProcessor()
    }

    async executeDownload(options: DownloadOptions): Promise<DownloadResult> {
        try {
            const toggleName =
                options.format === 'video' ? 'DOWNLOAD_VIDEO' : 'DOWNLOAD_AUDIO'
            const context = options.userId
                ? {
                      userId: options.userId,
                      guildId: options.guildId,
                  }
                : undefined
            const isEnabled = await featureToggleService.isEnabled(
                toggleName,
                context,
            )

            if (!isEnabled) {
                return {
                    success: false,
                    error: 'This feature is currently disabled',
                }
            }

            // Validate download options
            const validation = await this.validator.validateDownload(options)
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error,
                }
            }

            // Process download
            const result = await this.processor.processDownload(options)
            return result
        } catch (error) {
            errorLog({ message: 'Download command error:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    async createDownloadResponse(
        result: DownloadResult,
        url: string,
    ): Promise<{
        content: string
        files: AttachmentBuilder[]
        embeds?: unknown[]
    }> {
        if (
            result.success &&
            result.filePath !== undefined &&
            result.filePath !== ''
        ) {
            const attachment = new AttachmentBuilder(result.filePath, {
                name: result.fileName ?? 'download',
            })

            const embed = createSuccessEmbed(result, url)

            return {
                content: '',
                embeds: [embed],
                files: [attachment],
            }
        } else {
            return {
                content: '',
                files: [],
                embeds: [
                    createErrorEmbed(
                        'Download Failed',
                        result.error ?? 'Unknown error',
                    ),
                ],
            }
        }
    }
}

export const downloadCommand = new DownloadCommandService()
