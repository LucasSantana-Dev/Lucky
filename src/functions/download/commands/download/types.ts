/**
 * Download command types and interfaces
 */

export type DownloadOptions = {
    url: string
    format: 'audio' | 'video'
    quality?: string
    maxDuration?: number
    maxFileSize?: number
    userId?: string
    guildId?: string
}

export type DownloadResult = {
    success: boolean
    filePath?: string
    fileName?: string
    fileSize?: number
    duration?: number
    error?: string
}

export type DownloadCommandState = {
    isProcessing: boolean
    currentUrl?: string
    startTime?: number
}

export type DownloadValidation = {
    isValid: boolean
    error?: string
    platform?: string
}

export type PlatformInfo = {
    name: string
    supported: boolean
    requiresAuth?: boolean
    maxDuration?: number
    maxFileSize?: number
}
