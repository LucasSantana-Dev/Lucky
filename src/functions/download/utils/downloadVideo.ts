import ffmpeg from "fluent-ffmpeg"
import path from "path"
import play from "play-dl"
import fs from "fs"
import type { ChatInputCommandInteraction } from "discord.js"
import { deleteContent } from "./deleteContent"
import { errorLog, infoLog } from "../../../utils/general/log"
import { interactionReply } from "../../../utils/general/interactionReply"

interface VideoInfo {
    videoDetails: {
        lengthSeconds: string
    }
}

interface DownloadVideoParams {
    url: string
    interaction: ChatInputCommandInteraction
    videoFileName: string
    outputPath: string
    outputFileName: string
    videoInfo: VideoInfo
    audioPath: string
}

export const downloadVideo = async ({
    url,
    interaction,
    videoFileName,
    outputPath,
    outputFileName,
    videoInfo,
    audioPath,
}: DownloadVideoParams): Promise<void> => {
    try {
        const videoPath = path.resolve(
            __dirname,
            `../../content/${videoFileName}`,
        )
        outputPath = path.resolve(__dirname, `../../content/${outputFileName}`)

        const videoLength = parseInt(videoInfo.videoDetails.lengthSeconds, 10)

        if (videoLength > 600) {
            await interactionReply({
                interaction,
                content: {
                    content: "Only videos under 10 minutes can be downloaded.",
                },
            })
            return errorLog({
                message: "Video length is higher than 10 minutes.",
                error: null,
            })
        }

        // Create content directory if it doesn't exist
        const contentDir = path.resolve(__dirname, `../../content`)
        if (!fs.existsSync(contentDir)) {
            fs.mkdirSync(contentDir, { recursive: true })
        }

        // Download video stream
        infoLog({ message: "Starting video download" })
        const videoStream = await play.stream(url, { quality: 480 })

        // Create write stream for video
        const videoWriteStream = fs.createWriteStream(videoPath)

        // Pipe video stream to file with proper error handling
        await new Promise<void>((resolve, reject) => {
            // Force the stream to start flowing
            videoStream.stream.resume()

            // Set up error handlers
            videoStream.stream.on("error", (err) => {
                errorLog({ message: "Video stream error", error: err })
                reject(err)
            })

            videoWriteStream.on("error", (err) => {
                errorLog({ message: "Video write stream error", error: err })
                reject(err)
            })

            // Set up completion handler
            videoWriteStream.on("finish", () => {
                infoLog({ message: "Video download completed" })
                resolve()
            })

            // Pipe the stream to the file
            videoStream.stream.pipe(videoWriteStream)

            // Add a timeout to check if data is flowing
            setTimeout(() => {
                if (videoStream.stream.readableLength === 0) {
                    errorLog({
                        message:
                            "No data received after 10 seconds, restarting download",
                    })
                    // Try to restart the download
                    videoStream.stream.unpipe(videoWriteStream)
                    videoWriteStream.end()
                    const newVideoWriteStream = fs.createWriteStream(videoPath)
                    videoStream.stream.pipe(newVideoWriteStream)
                }
            }, 10000)
        })

        // Download audio stream
        infoLog({ message: "Starting audio download" })
        const audioStream = await play.stream(url, { quality: 0 }) // 0 for audio only

        // Create write stream for audio
        const audioWriteStream = fs.createWriteStream(audioPath)

        // Pipe audio stream to file with proper error handling
        await new Promise<void>((resolve, reject) => {
            // Force the stream to start flowing
            audioStream.stream.resume()

            // Set up error handlers
            audioStream.stream.on("error", (err) => {
                errorLog({ message: "Audio stream error", error: err })
                reject(err)
            })

            audioWriteStream.on("error", (err) => {
                errorLog({ message: "Audio write stream error", error: err })
                reject(err)
            })

            // Set up completion handler
            audioWriteStream.on("finish", () => {
                infoLog({ message: "Audio download completed" })
                resolve()
            })

            // Pipe the stream to the file
            audioStream.stream.pipe(audioWriteStream)
        })

        // Combine video and audio
        infoLog({ message: "Combining video and audio" })

        const videoOutputQuality = videoLength < 500 ? "23" : "26"

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(videoPath)
                .input(audioPath)
                .outputOptions("-c:v", "libx264")
                .outputOptions("-c:a", "aac")
                .outputOptions("-crf", videoOutputQuality)
                .outputOptions("-preset", "ultrafast")
                .outputOptions("-movflags", "frag_keyframe+empty_moov")
                .output(outputPath)
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .run()
        })

        // Clean up temporary files
        if (fs.existsSync(videoPath)) await deleteContent(videoPath)
        if (fs.existsSync(audioPath)) await deleteContent(audioPath)

        await interactionReply({
            interaction,
            content: {
                content: "Downloading the video...",
                files: [outputPath],
            },
        })

        // Clean up streams
        audioStream.stream.destroy()
        videoStream.stream.destroy()
    } catch (error) {
        errorLog({ message: "There was an error downloading the video", error })
        throw error
    }
}
