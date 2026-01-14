import { YtDlpDownloaderService } from './service'
import type {
    YtDlpDownloadResult,
    YtDlpOptions,
    YtDlpArgs,
    YtDlpProcessResult,
} from './types'

/**
 * Main yt-dlp downloader
 */
export class YtDlpDownloader {
    private readonly service: YtDlpDownloaderService

    constructor() {
        this.service = new YtDlpDownloaderService()
    }

    async downloadVideo(
        url: string,
        options: YtDlpOptions,
    ): Promise<YtDlpDownloadResult> {
        return this.service.downloadVideo(url, options)
    }

    async cleanupFile(filePath: string): Promise<void> {
        return this.service.cleanupFile(filePath)
    }
}

export const ytDlpDownloader = new YtDlpDownloader()

export const downloadVideo = async (
    url: string,
    options: YtDlpOptions,
): Promise<YtDlpDownloadResult> => {
    return ytDlpDownloader.downloadVideo(url, options)
}

export const cleanupFile = async (filePath: string): Promise<void> => {
    return ytDlpDownloader.cleanupFile(filePath)
}

export type { YtDlpDownloadResult, YtDlpOptions, YtDlpArgs, YtDlpProcessResult }
