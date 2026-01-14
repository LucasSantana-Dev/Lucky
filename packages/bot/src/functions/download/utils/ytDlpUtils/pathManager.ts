import { existsSync } from 'fs'
import type { YtDlpConfig } from './types'

/**
 * yt-dlp path management utilities
 */
export class YtDlpPathManager {
    private static getYtDlpPath(): string {
        const possiblePaths = [
            'yt-dlp',
            'yt-dlp.exe',
            'C:\\Users\\lucas\\AppData\\Roaming\\Python\\Python313\\Scripts\\yt-dlp.exe',
            'C:\\Users\\lucas\\AppData\\Local\\Programs\\Python\\Python313\\Scripts\\yt-dlp.exe',
            'C:\\Python313\\Scripts\\yt-dlp.exe',
        ]

        for (const path of possiblePaths) {
            if (path.includes('\\') && existsSync(path)) {
                return path
            }
        }

        return possiblePaths[0]
    }

    static getConfig(): YtDlpConfig {
        return {
            executablePath: this.getYtDlpPath(),
            outputDir: process.env.DOWNLOAD_DIR ?? './downloads',
            maxConcurrent: 3,
            timeout: 300000, // 5 minutes
        }
    }

    static validatePath(): boolean {
        const config = this.getConfig()
        return existsSync(config.executablePath)
    }

    static getOutputPath(filename: string): string {
        const config = this.getConfig()
        return `${config.outputDir}/${filename}`
    }
}
