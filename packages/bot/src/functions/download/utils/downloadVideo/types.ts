/**
 * Download video types and interfaces
 */

import type { ChatInputCommandInteraction } from 'discord.js'

export type VideoInfo = {
    videoDetails: {
        lengthSeconds: string
    }
}

export type DownloadVideoParams = {
    url: string
    interaction: ChatInputCommandInteraction
    videoFileName: string
    outputPath: string
    outputFileName: string
    videoInfo: VideoInfo
    audioPath: string
}

export type DownloadOptions = {
    format: 'audio' | 'video'
    quality?: string
    maxDuration?: number
    maxFileSize?: number
}

export type DownloadResult = {
    success: boolean
    filePath?: string
    fileName?: string
    fileSize?: number
    duration?: number
    error?: string
}
