import { spawn } from "child_process"
import { unlink } from "fs/promises"
import { debugLog } from "../../../utils/general/log"
import { existsSync } from "fs"
import ffmpeg from "ffmpeg-static"
import { ENVIRONMENT_CONFIG } from "../../../config/environmentConfig"

type YtDlpDownloadResult = {
    success: boolean
    filePath?: string
    error?: string
}

function getYtDlpPath(): string {
    const possiblePaths = [
        "yt-dlp",
        "yt-dlp.exe",
        "C:\\Users\\lucas\\AppData\\Roaming\\Python\\Python313\\Scripts\\yt-dlp.exe",
        "C:\\Users\\lucas\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\yt-dlp.exe",
        "C:\\Python313\\Scripts\\yt-dlp.exe",
    ]

    for (const path of possiblePaths) {
        if (path.includes("\\") && existsSync(path)) {
            return path
        }
    }

    return possiblePaths[0]
}

export async function downloadWithYtDlp(
    url: string,
    format: "video" | "audio",
    outputPath: string,
): Promise<YtDlpDownloadResult> {
    if (url.includes("tiktok.com")) {
        debugLog({
            message: "Attempting TikTok download without authentication first",
        })

        const unauthenticatedResult = await downloadWithYtDlpInternal(
            url,
            format,
            outputPath,
            undefined,
        )

        if (unauthenticatedResult.success) {
            debugLog({
                message: "TikTok download succeeded without authentication",
            })
            return unauthenticatedResult
        }

        if (
            unauthenticatedResult.error?.includes("requiring login") ||
            unauthenticatedResult.error?.includes("Sign in") ||
            unauthenticatedResult.error?.includes("authentication")
        ) {
            debugLog({
                message:
                    "TikTok requires authentication, trying with browser cookies",
            })

            const browsers = [
                "brave",
                "chrome",
                "firefox",
                "edge",
                "vivaldi",
                "safari",
            ]

            for (const browser of browsers) {
                debugLog({
                    message: `Trying TikTok download with ${browser} cookies`,
                })

                const result = await downloadWithYtDlpInternal(
                    url,
                    format,
                    outputPath,
                    browser,
                )

                if (result.success) {
                    return result
                }

                if (
                    result.error?.includes("requiring login") ||
                    result.error?.includes("Sign in")
                ) {
                    debugLog({
                        message: `${browser} failed, trying next browser`,
                    })
                    continue
                }

                return result
            }
        }

        return unauthenticatedResult
    }

    return downloadWithYtDlpInternal(url, format, outputPath)
}

async function downloadWithYtDlpInternal(
    url: string,
    format: "video" | "audio",
    outputPath: string,
    browser?: string,
): Promise<YtDlpDownloadResult> {
    return new Promise((resolve) => {
        const ytDlpPath = getYtDlpPath()
        const args = [url, "-o", outputPath, "--no-playlist"]

        if (ffmpeg) {
            const ffmpegDir = ffmpeg.replace(/\\/g, "/").replace(/\/[^/]*$/, "")
            args.push("--ffmpeg-location", ffmpegDir)
        }

        if (url.includes("tiktok.com")) {
            args.push(
                "--user-agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            )
            args.push("--referer", ENVIRONMENT_CONFIG.TIKTOK.REFERER_URL)
            args.push("--no-check-certificates")

            if (!browser) {
                args.push(
                    "--extractor-args",
                    `tiktok:api_hostname=${ENVIRONMENT_CONFIG.TIKTOK.API_HOSTNAME}`,
                )
                args.push(
                    "--extractor-retries",
                    ENVIRONMENT_CONFIG.TIKTOK.EXTRACTOR_RETRIES.toString(),
                )
                args.push(
                    "--fragment-retries",
                    ENVIRONMENT_CONFIG.TIKTOK.FRAGMENT_RETRIES.toString(),
                )
                args.push(
                    "--sleep-interval",
                    ENVIRONMENT_CONFIG.TIKTOK.SLEEP_INTERVAL.toString(),
                )
                args.push(
                    "--max-sleep-interval",
                    ENVIRONMENT_CONFIG.TIKTOK.MAX_SLEEP_INTERVAL.toString(),
                )
            } else {
                args.push(
                    "--extractor-args",
                    `tiktok:api_hostname=${ENVIRONMENT_CONFIG.TIKTOK.API_HOSTNAME}`,
                )
            }

            if (browser) {
                args.push("--cookies-from-browser", browser)
                debugLog({
                    message: `Using ${browser} cookies for TikTok authentication`,
                })
            } else {
                debugLog({
                    message:
                        "Attempting TikTok download without authentication",
                })
            }
        }

        if (format === "audio") {
            args.push("-x", "--audio-format", "mp3")
        } else {
            // Use modern format selection instead of deprecated -f mp4
            args.push("-f", "best[ext=mp4]/best")
        }

        debugLog({
            message: `Starting yt-dlp download with command: ${ytDlpPath} ${args.join(" ")}`,
        })

        const ytDlp = spawn(ytDlpPath, args)
        let errorMsg = ""

        ytDlp.stderr.on("data", (data) => {
            errorMsg += data.toString()
        })

        ytDlp.on("error", (err) => {
            debugLog({ message: "yt-dlp spawn error", error: err })
            resolve({
                success: false,
                error: `yt-dlp not found or not executable: ${err.message}`,
            })
        })

        ytDlp.on("close", async (code) => {
            if (code === 0) {
                resolve({ success: true, filePath: outputPath })
            } else {
                try {
                    await unlink(outputPath)
                } catch {
                    // Ignore errors during cleanup
                }

                const errorMessage =
                    errorMsg || `yt-dlp failed with code ${code}`
                debugLog({
                    message: "yt-dlp download failed",
                    error: errorMessage,
                })

                let userFriendlyError = errorMessage

                if (
                    errorMessage.includes("TikTok is requiring login") ||
                    errorMessage.includes("login?redirect_url")
                ) {
                    userFriendlyError =
                        "❌ **TikTok Authentication Required**\n\nThis TikTok video requires authentication to download. Please try:\n\n1. **Log into TikTok** in your browser (Brave/Chrome/Firefox/Edge/Vivaldi)\n2. **Try the download again** - the bot will use your browser cookies\n3. **Alternative**: Try downloading a different TikTok video that doesn't require login"
                } else if (
                    errorMessage.includes("could not find") &&
                    errorMessage.includes("cookies database")
                ) {
                    userFriendlyError =
                        "❌ **Browser Cookies Not Found**\n\nCould not find browser cookies for authentication. Please:\n\n1. **Log into TikTok** in one of these browsers:\n   • Brave\n   • Chrome\n   • Firefox\n   • Edge\n   • Vivaldi\n2. **Try the download again**\n3. **Alternative**: Try a different browser or a different TikTok video"
                } else if (errorMessage.includes("Video unavailable")) {
                    userFriendlyError =
                        "❌ **Video Unavailable**\n\nThis video is not available for download. It may be:\n• Private or deleted\n• Region-restricted\n• Age-restricted\n• Removed by the platform"
                } else if (errorMessage.includes("Sign in")) {
                    userFriendlyError =
                        "❌ **Authentication Required**\n\nThis content requires you to be signed in. Please log into the platform in your browser and try again."
                } else if (
                    errorMessage.includes("Unsupported URL") &&
                    errorMessage.includes("tiktok.com")
                ) {
                    userFriendlyError =
                        "❌ **TikTok Video Not Accessible**\n\nThis TikTok video is not accessible for download. It may be:\n• Private or restricted\n• Requiring authentication\n• Region-locked\n• Removed by TikTok\n\n**Try**: A different TikTok video or use authentication with browser cookies."
                }

                resolve({
                    success: false,
                    error: userFriendlyError,
                })
            }
        })
    })
}
