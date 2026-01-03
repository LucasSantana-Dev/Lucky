import { downloadVideo, deleteDownloadedFile } from '../../utils/downloadUtils'
import { formatDuration } from '../../utils/downloadHelpers'
import { errorLog, infoLog, successLog } from '../../../../utils/general/log'
import type { DownloadOptions, DownloadResult } from './types'

/**
 * Download processor for handling file downloads
 */
export class DownloadProcessor {
    async processDownload(options: DownloadOptions): Promise<DownloadResult> {
        try {
            infoLog({ message: `Starting download: ${options.url}` })

            const result = await downloadVideo(options.url, options.format)

            if (result.success) {
                successLog({
                    message: `Download completed: ${result.filePath}`,
                })
                return {
                    success: true,
                    filePath: result.filePath,
                    fileName:
                        result.filePath !== undefined && result.filePath !== ''
                            ? (result.filePath.split('/').pop() ?? 'download')
                            : 'download',
                    fileSize: 0, // Will be calculated later
                    duration: 0, // Will be calculated later
                }
            } else {
                errorLog({ message: `Download failed: ${result.error}` })
                return {
                    success: false,
                    error: result.error,
                }
            }
        } catch (error) {
            errorLog({ message: 'Download processing error:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    async cleanupDownload(filePath: string): Promise<void> {
        try {
            await deleteDownloadedFile(filePath)
            infoLog({ message: `Cleaned up download file: ${filePath}` })
        } catch (error) {
            errorLog({ message: 'Error cleaning up download file:', error })
        }
    }

    formatFileSize(bytes: number): string {
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        if (bytes === 0) return '0 Bytes'
        const i = Math.floor(Math.log(bytes) / Math.log(1024))
        return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`
    }

    formatDuration(seconds: number): string {
        return formatDuration(seconds)
    }
}
