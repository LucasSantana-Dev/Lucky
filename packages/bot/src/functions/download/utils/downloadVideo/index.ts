import { DownloadVideoService } from './service'
import type { DownloadOptions, DownloadResult } from './types'

/**
 * Main download video service
 */
export class DownloadVideo {
    private readonly service: DownloadVideoService

    constructor() {
        this.service = new DownloadVideoService()
    }

    async downloadVideo(
        url: string,
        format: 'audio' | 'video',
    ): Promise<DownloadResult> {
        return this.service.downloadVideo(url, format)
    }
}

export const downloadVideo = new DownloadVideo()

export const downloadVideoFile = async (
    url: string,
    format: 'audio' | 'video',
): Promise<DownloadResult> => {
    return downloadVideo.downloadVideo(url, format)
}

export type { DownloadOptions, DownloadResult }
