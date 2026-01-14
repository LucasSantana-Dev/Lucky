/**
 * yt-dlp utilities types and interfaces
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

export type YtDlpInfo = {
    title: string
    duration: number
    fileSize: number
    format: string
    url: string
}

export type YtDlpConfig = {
    executablePath: string
    outputDir: string
    maxConcurrent: number
    timeout: number
}
