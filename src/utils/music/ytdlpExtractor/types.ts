/**
 * yt-dlp extractor types and interfaces
 */

// import type { ExtractorInfo, ExtractorSearchContext } from "discord-player"

export type YtDlpExtractorOptions = {
    executablePath: string
    outputFormat: string
    maxDuration: number
    timeout: number
}

export type YtDlpExtractorResult = {
    success: boolean
    tracks?: unknown[]
    error?: string
}

export type YtDlpExtractorConfig = {
    identifier: string
    name: string
    description: string
    version: string
}
