import path from 'path'
import play from 'play-dl'
import fs from 'fs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { deleteContent } from './deleteContent'
import { errorLog, infoLog } from '@lukbot/shared/utils'
import { interactionReply } from '../../../utils/general/interactionReply'
import { convertFileToFile } from '../../../utils/ffmpeg/ffmpegWrapper'

// NodeJS types are available via @types/node
import type { Readable } from 'stream'

type DownloadAudioParams = {
    url: string
    interaction: ChatInputCommandInteraction
    videoInfo: unknown
    outputPath: string
    outputFileName: string
    audioPath: string
}

function validateVideoLength(videoInfo: unknown): number {
    return (videoInfo as { videoDetails: { lengthSeconds: number } })
        .videoDetails.lengthSeconds
}

async function checkVideoLength(
    videoLength: number,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (videoLength > 600) {
        await interactionReply({
            interaction,
            content: {
                content: 'Only videos under 10 minutes can be downloaded.',
            },
        })
        errorLog({
            message: 'Video length is higher than 10 minutes.',
            error: null,
        })
        return false
    }
    return true
}

function createContentDirectory(): void {
    const contentDir = path.resolve(__dirname, `../../content`)
    if (!fs.existsSync(contentDir)) {
        fs.mkdirSync(contentDir, { recursive: true })
    }
}

async function downloadAudioStream(url: string): Promise<unknown> {
    infoLog({ message: 'Starting audio download' })
    return await play.stream(url, { quality: 0 })
}

async function saveStreamToTempFile(
    audioStream: unknown,
    outputFileName: string,
): Promise<string> {
    const tempAudioPath = path.resolve(
        __dirname,
        `../../content/temp_${outputFileName}`,
    )
    const writeStream = fs.createWriteStream(tempAudioPath)

    // Type guard for audioStream
    if (
        audioStream === null ||
        audioStream === undefined ||
        typeof audioStream !== 'object' ||
        !('stream' in audioStream)
    ) {
        throw new Error('Invalid audio stream')
    }

    const { stream } = audioStream as { stream: Readable }

    await new Promise<void>((resolve, reject) => {
        stream.pipe(writeStream)
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
    })

    return tempAudioPath
}

async function convertToMp3(
    tempAudioPath: string,
    outputPath: string,
): Promise<void> {
    infoLog({ message: 'Converting audio to MP3' })

    const result = await convertFileToFile({
        input: tempAudioPath,
        output: outputPath,
        audioCodec: 'libmp3lame',
        audioBitrate: '128k',
    })

    if (!result.success) {
        throw new Error(result.error ?? 'FFmpeg conversion failed')
    }
}

async function cleanupFiles(
    tempAudioPath: string,
    audioPath: string,
): Promise<void> {
    if (fs.existsSync(tempAudioPath)) await deleteContent(tempAudioPath)
    if (fs.existsSync(audioPath)) await deleteContent(audioPath)
}

export const downloadAudio = async ({
    url,
    interaction,
    videoInfo,
    outputPath,
    outputFileName,
    audioPath,
}: DownloadAudioParams): Promise<void> => {
    try {
        const videoLength = validateVideoLength(videoInfo)

        if (!(await checkVideoLength(videoLength, interaction))) {
            return
        }

        createContentDirectory()

        const audioStream = await downloadAudioStream(url)
        outputPath = path.resolve(__dirname, `../../content/${outputFileName}`)

        const tempAudioPath = await saveStreamToTempFile(
            audioStream,
            outputFileName,
        )
        await convertToMp3(tempAudioPath, outputPath)
        await cleanupFiles(tempAudioPath, audioPath)

        await interactionReply({
            interaction,
            content: {
                content: 'Downloading the audio...',
                files: [outputPath],
            },
        })

        if (
            audioStream !== null &&
            audioStream !== undefined &&
            typeof audioStream === 'object' &&
            'stream' in audioStream
        ) {
            const streamObj = audioStream as {
                stream: { destroy?: () => void }
            }
            if (
                streamObj.stream &&
                typeof streamObj.stream.destroy === 'function'
            ) {
                try {
                    streamObj.stream.destroy()
                } catch (_destroyError) {
                    // Ignore destroy errors
                }
            }
        }
    } catch (error) {
        errorLog({ message: 'There was an error downloading the audio', error })
        throw error
    }
}
