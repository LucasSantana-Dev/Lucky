import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import play from 'play-dl'
import fs from 'fs'
import { errorLog, infoLog } from '../../../../utils/general/log'

type DownloadResult = {
    success: boolean
    filePath?: string
    fileName?: string
    fileSize?: number
    duration?: number
    error?: string
}

type DownloadAudioOptions = {
    url: string
    videoInfo: unknown
    audioPath: string
    outputPath: string
    outputFileName: string
}

type DownloadVideoOptions = {
    url: string
    videoInfo: unknown
    outputPath: string
    outputFileName: string
}

/**
 * Download video service
 */
export class DownloadVideoService {
    async downloadVideo(
        url: string,
        format: 'audio' | 'video',
    ): Promise<DownloadResult> {
        try {
            infoLog({ message: `Starting download: ${url}` })

            const videoInfo = await play.video_info(url)
            if (videoInfo === null || videoInfo === undefined) {
                return {
                    success: false,
                    error: 'Could not get video information',
                }
            }

            const videoFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}`
            const outputPath = process.env.DOWNLOAD_DIR ?? './downloads'
            const outputFileName = `${videoFileName}.${format === 'audio' ? 'mp3' : 'mp4'}`
            const audioPath = path.join(
                outputPath,
                `${videoFileName}_audio.mp3`,
            )

            // Create output directory if it doesn't exist
            if (!fs.existsSync(outputPath)) {
                fs.mkdirSync(outputPath, { recursive: true })
            }

            if (format === 'audio') {
                return await this.downloadAudio({
                    url,
                    videoInfo,
                    audioPath,
                    outputPath,
                    outputFileName,
                })
            } else {
                return await this.downloadVideoFile({
                    url,
                    videoInfo,
                    outputPath,
                    outputFileName,
                })
            }
        } catch (error) {
            errorLog({ message: 'Download video error:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    private async downloadAudio(
        options: DownloadAudioOptions,
    ): Promise<DownloadResult> {
        const { url, videoInfo, audioPath, outputPath, outputFileName } =
            options
        try {
            const stream = await play.stream(url, { quality: 0 })
            if (
                stream === null ||
                stream === undefined ||
                typeof stream !== 'object' ||
                !('stream' in stream)
            ) {
                return {
                    success: false,
                    error: 'Could not get audio stream',
                }
            }

            return new Promise((resolve) => {
                ffmpeg(stream.stream)
                    .audioCodec('libmp3lame')
                    .audioBitrate(128)
                    .format('mp3')
                    .on('end', () => {
                        const finalPath = path.join(outputPath, outputFileName)
                        fs.renameSync(audioPath, finalPath)

                        const stats = fs.statSync(finalPath)
                        resolve({
                            success: true,
                            filePath: finalPath,
                            fileName: outputFileName,
                            fileSize: stats.size,
                            duration: parseInt(
                                (
                                    videoInfo as {
                                        videoDetails?: {
                                            lengthSeconds?: string
                                        }
                                    }
                                ).videoDetails?.lengthSeconds ?? '0',
                            ),
                        })
                    })
                    .on('error', (err) => {
                        resolve({
                            success: false,
                            error: err.message,
                        })
                    })
                    .save(audioPath)
            })
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    private async downloadVideoFile(
        options: DownloadVideoOptions,
    ): Promise<DownloadResult> {
        const { url, videoInfo, outputPath, outputFileName } = options
        try {
            const stream = await play.stream(url, { quality: 0 })
            if (!stream) {
                return {
                    success: false,
                    error: 'Could not get video stream',
                }
            }

            const finalPath = path.join(outputPath, outputFileName)

            return new Promise((resolve) => {
                ffmpeg(stream.stream)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .format('mp4')
                    .on('end', () => {
                        const stats = fs.statSync(finalPath)
                        resolve({
                            success: true,
                            filePath: finalPath,
                            fileName: outputFileName,
                            fileSize: stats.size,
                            duration: parseInt(
                                (
                                    videoInfo as {
                                        videoDetails?: {
                                            lengthSeconds?: string
                                        }
                                    }
                                ).videoDetails?.lengthSeconds ?? '0',
                            ),
                        })
                    })
                    .on('error', (err) => {
                        resolve({
                            success: false,
                            error: err.message,
                        })
                    })
                    .save(finalPath)
            })
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }
}
