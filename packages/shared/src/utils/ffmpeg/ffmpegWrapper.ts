import { spawn } from 'child_process'
import { Readable } from 'stream'
import { existsSync } from 'fs'
import ffmpegStatic from 'ffmpeg-static'
import { errorLog } from '../general/log'

type FFmpegOptions = {
    input: string | Readable
    output: string
    audioCodec?: string
    videoCodec?: string
    audioBitrate?: string | number
    format?: string
    onProgress?: (progress: number) => void
}

type FFmpegResult = {
    success: boolean
    error?: string
}

function getFFmpegPath(): string {
    if (ffmpegStatic !== null && ffmpegStatic !== undefined) {
        return ffmpegStatic
    }

    const systemFFmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'
    if (existsSync(systemFFmpeg)) {
        return systemFFmpeg
    }

    return 'ffmpeg'
}

function buildFFmpegArgs(options: FFmpegOptions): string[] {
    const args: string[] = ['-y']

    if (typeof options.input === 'string') {
        args.push('-i', options.input)
    } else {
        args.push('-i', 'pipe:0')
    }

    if (options.audioCodec !== undefined) {
        args.push('-acodec', options.audioCodec)
    }

    if (options.videoCodec !== undefined) {
        args.push('-vcodec', options.videoCodec)
    }

    if (options.audioBitrate !== undefined) {
        const bitrate =
            typeof options.audioBitrate === 'number'
                ? `${options.audioBitrate}k`
                : options.audioBitrate
        args.push('-b:a', bitrate)
    }

    if (options.format !== undefined) {
        args.push('-f', options.format)
    }

    args.push(options.output)

    return args
}

export async function convertStreamToFile(
    options: FFmpegOptions,
): Promise<FFmpegResult> {
    return new Promise((resolve) => {
        const ffmpegPath = getFFmpegPath()
        const args = buildFFmpegArgs(options)

        const ffmpegProcess = spawn(ffmpegPath, args, {
            stdio: typeof options.input === 'string' ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
        })

        if (options.input instanceof Readable) {
            if (ffmpegProcess.stdin) {
                options.input.pipe(ffmpegProcess.stdin)
            }
            options.input.on('error', (error) => {
                errorLog({ message: 'Input stream error:', error })
                ffmpegProcess.kill()
                resolve({
                    success: false,
                    error: error instanceof Error ? error.message : 'Stream error',
                })
            })
        }

        ffmpegProcess.stderr?.on('data', (data: Buffer) => {
            const output = data.toString()

            if (options.onProgress !== undefined) {
                const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}/)
                const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d{2}/)

                if (durationMatch !== null && timeMatch !== null) {
                    const duration =
                        parseInt(durationMatch[1]) * 3600 +
                        parseInt(durationMatch[2]) * 60 +
                        parseInt(durationMatch[3])
                    const current =
                        parseInt(timeMatch[1]) * 3600 +
                        parseInt(timeMatch[2]) * 60 +
                        parseInt(timeMatch[3])
                    const progress = (current / duration) * 100
                    options.onProgress(progress)
                }
            }
        })

        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true })
            } else {
                const errorMessage = code !== null && code !== undefined
                    ? `FFmpeg process exited with code ${code}`
                    : 'FFmpeg process exited with unknown code'
                resolve({
                    success: false,
                    error: errorMessage,
                })
            }
        })

        ffmpegProcess.on('error', (error) => {
            errorLog({ message: 'FFmpeg process error:', error })
            resolve({
                success: false,
                error: error instanceof Error ? error.message : 'FFmpeg error',
            })
        })
    })
}

export async function convertFileToFile(
    options: FFmpegOptions,
): Promise<FFmpegResult> {
    if (typeof options.input !== 'string') {
        return {
            success: false,
            error: 'File input must be a string path',
        }
    }

    if (!existsSync(options.input)) {
        return {
            success: false,
            error: `Input file does not exist: ${options.input}`,
        }
    }

    return convertStreamToFile(options)
}
