import { YtDlpPathManager } from './pathManager'
import { YtDlpDownloaderService } from './downloader/service'
import type {
    YtDlpDownloadResult,
    YtDlpOptions,
    YtDlpInfo,
    YtDlpConfig,
} from './types'

/**
 * Main yt-dlp utilities service
 */
export class YtDlpUtils {
    private readonly downloader: YtDlpDownloaderService

    constructor() {
        this.downloader = new YtDlpDownloaderService()
    }

    async downloadVideo(
        url: string,
        options: YtDlpOptions,
    ): Promise<YtDlpDownloadResult> {
        return this.downloader.downloadVideo(url, options)
    }

    async cleanupFile(filePath: string): Promise<void> {
        return this.downloader.cleanupFile(filePath)
    }

    getConfig(): YtDlpConfig {
        return YtDlpPathManager.getConfig()
    }

    validatePath(): boolean {
        return YtDlpPathManager.validatePath()
    }

    getOutputPath(filename: string): string {
        return YtDlpPathManager.getOutputPath(filename)
    }
}

export const ytDlpUtils = new YtDlpUtils()

export const downloadVideo = async (
    url: string,
    options: YtDlpOptions,
): Promise<YtDlpDownloadResult> => {
    return ytDlpUtils.downloadVideo(url, options)
}

export const cleanupFile = async (filePath: string): Promise<void> => {
    return ytDlpUtils.cleanupFile(filePath)
}

export const getConfig = (): YtDlpConfig => {
    return ytDlpUtils.getConfig()
}

export const validatePath = (): boolean => {
    return ytDlpUtils.validatePath()
}

export const getOutputPath = (filename: string): string => {
    return ytDlpUtils.getOutputPath(filename)
}

export const downloadWithYtDlp = async (
    url: string,
    options: YtDlpOptions,
): Promise<YtDlpDownloadResult> => {
    return ytDlpUtils.downloadVideo(url, options)
}

export type { YtDlpDownloadResult, YtDlpOptions, YtDlpInfo, YtDlpConfig }
