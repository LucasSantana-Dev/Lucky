import path from 'path'
import play from 'play-dl'
import fs from 'fs'
import { errorLog, infoLog } from '@lukbot/shared/utils'
import { convertStreamToFile } from '../../../../utils/ffmpeg/ffmpegWrapper'
import type { Readable } from 'stream'

type DownloadResult = { success: boolean; filePath?: string; fileName?: string; fileSize?: number; duration?: number; error?: string }
type DownloadAudioOptions = { url: string; videoInfo: unknown; audioPath: string; outputPath: string; outputFileName: string }
type DownloadVideoOptions = { url: string; videoInfo: unknown; outputPath: string; outputFileName: string }

function parseDuration(videoInfo: unknown): number {
    return parseInt((videoInfo as { videoDetails?: { lengthSeconds?: string } }).videoDetails?.lengthSeconds ?? '0')
}

function validateStream(stream: unknown): stream is { stream: Readable } {
    return stream !== null && stream !== undefined && typeof stream === 'object' && 'stream' in (stream as Record<string, unknown>)
}

export class DownloadVideoService {
    async downloadVideo(url: string, format: 'audio' | 'video'): Promise<DownloadResult> {
        try {
            infoLog({ message: `Starting download: ${url}` })
            const videoInfo = await play.video_info(url)
            if (!videoInfo) return { success: false, error: 'Could not get video information' }

            const videoFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}`
            const outputPath = process.env.DOWNLOAD_DIR ?? './downloads'
            const outputFileName = `${videoFileName}.${format === 'audio' ? 'mp3' : 'mp4'}`
            const audioPath = path.join(outputPath, `${videoFileName}_audio.mp3`)

            if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true })

            if (format === 'audio') return await this.downloadAudio({ url, videoInfo, audioPath, outputPath, outputFileName })
            return await this.downloadVideoFile({ url, videoInfo, outputPath, outputFileName })
        } catch (error) {
            errorLog({ message: 'Download video error:', error })
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    private async downloadAudio(options: DownloadAudioOptions): Promise<DownloadResult> {
        const { url, videoInfo, audioPath, outputPath, outputFileName } = options
        try {
            const stream = await play.stream(url, { quality: 0 })
            if (!validateStream(stream)) return { success: false, error: 'Could not get audio stream' }

            const result = await convertStreamToFile({ input: stream.stream as Readable, output: audioPath, audioCodec: 'libmp3lame', audioBitrate: 128, format: 'mp3' })
            if (!result.success) return { success: false, error: result.error ?? 'FFmpeg conversion failed' }

            const finalPath = path.join(outputPath, outputFileName)
            fs.renameSync(audioPath, finalPath)
            const stats = fs.statSync(finalPath)
            return { success: true, filePath: finalPath, fileName: outputFileName, fileSize: stats.size, duration: parseDuration(videoInfo) }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }

    private async downloadVideoFile(options: DownloadVideoOptions): Promise<DownloadResult> {
        const { url, videoInfo, outputPath, outputFileName } = options
        try {
            const stream = await play.stream(url, { quality: 0 })
            if (!validateStream(stream)) return { success: false, error: 'Could not get video stream' }

            const finalPath = path.join(outputPath, outputFileName)
            const result = await convertStreamToFile({ input: stream.stream as Readable, output: finalPath, videoCodec: 'libx264', audioCodec: 'aac', format: 'mp4' })
            if (!result.success) return { success: false, error: result.error ?? 'FFmpeg conversion failed' }

            const stats = fs.statSync(finalPath)
            return { success: true, filePath: finalPath, fileName: outputFileName, fileSize: stats.size, duration: parseDuration(videoInfo) }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
    }
}
