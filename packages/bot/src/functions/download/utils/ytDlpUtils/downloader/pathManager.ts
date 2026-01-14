import { join } from 'path'
import { existsSync } from 'fs'

export class YtDlpPathManager {
    private static ytDlpPath: string | null = null

    static getPath(): string {
        if (this.ytDlpPath !== null) {
            return this.ytDlpPath
        }

        const possiblePaths = [
            'yt-dlp',
            'yt-dlp.exe',
            join(process.cwd(), 'bin', 'yt-dlp'),
            join(process.cwd(), 'bin', 'yt-dlp.exe'),
        ]

        for (const path of possiblePaths) {
            if (existsSync(path)) {
                this.ytDlpPath = path
                return path
            }
        }

        this.ytDlpPath = 'yt-dlp'
        return 'yt-dlp'
    }

    static validatePath(): boolean {
        const path = this.getPath()
        return existsSync(path)
    }

    static getConfig() {
        return {
            path: this.getPath(),
            executablePath: this.getPath(),
            outputDir: join(process.cwd(), 'downloads'),
            maxConcurrent: 3,
            timeout: 30000,
        }
    }

    static getOutputPath(filename: string): string {
        return join(this.getConfig().outputDir, filename)
    }
}
