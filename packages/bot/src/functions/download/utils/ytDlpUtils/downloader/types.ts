/**
 * yt-dlp downloader types and interfaces
 */

export type YtDlpDownloadResult = {
    success: boolean
    filePath?: string
    error?: string
}

export type YtDlpOptions = {
    format: 'audio' | 'video'
    quality?: string
    outputPath?: string
    maxDuration?: number
    maxFileSize?: number
}

export type YtDlpArgs = {
    url: string
    format: string
    quality: string
    outputPath?: string
    maxDuration?: number
}

export type YtDlpProcessResult = {
    success: boolean
    stdout: string
    stderr: string
    exitCode: number
}
