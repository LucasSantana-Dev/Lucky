import { spawn } from 'child_process'
import { unlink } from 'fs/promises'
import { debugLog } from '@lukbot/shared/utils'
import { YtDlpPathManager } from './pathManager'
import type { YtDlpDownloadResult, YtDlpOptions, YtDlpArgs } from './types'

/**
 * yt-dlp downloader service
 */
export class YtDlpDownloaderService {
    private readonly config = YtDlpPathManager.getConfig()

    async downloadVideo(
        url: string,
        options: YtDlpOptions,
    ): Promise<YtDlpDownloadResult> {
        try {
            debugLog({ message: `Starting yt-dlp download: ${url}` })

            const args = this.buildArgs(url, options)
            const result = await this.executeDownload(args)

            if (result.success) {
                debugLog({ message: `Download completed: ${result.filePath}` })
            }

            return result
        } catch (error) {
            debugLog({ message: 'yt-dlp download error:', error })
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    private buildArgs(url: string, options: YtDlpOptions): YtDlpArgs {
        const args: YtDlpArgs = {
            url,
            format:
                options.format === 'audio' ? 'bestaudio' : 'best[height<=720]',
            quality: options.quality ?? 'best',
        }

        if (options.outputPath !== undefined && options.outputPath !== '') {
            args.outputPath = options.outputPath
        }

        if (options.maxDuration !== undefined && options.maxDuration > 0) {
            args.maxDuration = options.maxDuration
        }

        return args
    }

    private buildYtDlpCommand(args: YtDlpArgs): string[] {
        return [
            args.url,
            '--no-playlist',
            '--extract-flat',
            'false',
            '--write-info-json',
            '--write-thumbnail',
            '--embed-metadata',
            '--add-metadata',
            '--no-warnings',
            '--quiet',
            '--no-progress',
            '--format',
            args.format,
        ]
    }

    private setupProcessHandlers(
        process: unknown,
        resolve: (result: YtDlpDownloadResult) => void,
    ): void {
        let stdout = ''
        let stderr = ''

        // Type guard for process
        if (
            process === null ||
            process === undefined ||
            typeof process !== 'object'
        ) {
            resolve({ success: false, error: 'Invalid process object' })
            return
        }

        const proc = process as {
            stdout?: {
                on: (event: string, callback: (data: unknown) => void) => void
            }
            stderr?: {
                on: (event: string, callback: (data: unknown) => void) => void
            }
            on: (event: string, callback: (code: unknown) => void) => void
            kill?: () => void
        }

        proc.stdout?.on('data', (data) => {
            stdout += String(data)
        })

        proc.stderr?.on('data', (data) => {
            stderr += String(data)
        })

        proc.on('close', (code) => {
            if (code === 0) {
                const filePath = this.extractFilePath(stdout)
                resolve({
                    success: true,
                    filePath,
                })
            } else {
                resolve({
                    success: false,
                    error: stderr || `Process exited with code ${String(code)}`,
                })
            }
        })

        proc.on('error', (error: unknown) => {
            resolve({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            })
        })

        setTimeout(() => {
            if (typeof proc.kill === 'function') {
                proc.kill()
            }
            resolve({
                success: false,
                error: 'Download timeout',
            })
        }, this.config.timeout)
    }

    private async executeDownload(
        args: YtDlpArgs,
    ): Promise<YtDlpDownloadResult> {
        return new Promise((resolve) => {
            const command = this.buildYtDlpCommand(args)
            const process = spawn(this.config.executablePath, command, {
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            this.setupProcessHandlers(process, resolve)
        })
    }

    private extractFilePath(stdout: string): string | undefined {
        // Extract file path from yt-dlp output
        const lines = stdout.split('\n')
        for (const line of lines) {
            if (
                line.includes('[download]') &&
                line.includes('has already been downloaded')
            ) {
                const match = line.match(
                    /\[download\] (.+) has already been downloaded/,
                )
                if (match) {
                    return match[1]
                }
            }
        }
        return undefined
    }

    async cleanupFile(filePath: string): Promise<void> {
        try {
            await unlink(filePath)
            debugLog({ message: `Cleaned up file: ${filePath}` })
        } catch (error) {
            debugLog({ message: 'Error cleaning up file:', error })
        }
    }
}
