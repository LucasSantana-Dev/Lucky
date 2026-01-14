import {
    BaseExtractor,
    type ExtractorInfo,
    type ExtractorSearchContext,
    type ExtractorExecutionContext,
    type Track,
} from 'discord-player'
import { spawn } from 'child_process'
import { errorLog, debugLog } from '@lukbot/shared/utils'
import type { YtDlpExtractorOptions, YtDlpExtractorResult } from './types'

/**
 * yt-dlp extractor service
 */
export class YtDlpExtractorService extends BaseExtractor {
    static identifier = 'ytdlp'

    public readonly options: YtDlpExtractorOptions
    // private readonly _config: YtDlpExtractorConfig // Unused for now

    constructor(
        context: ExtractorExecutionContext,
        options?: Partial<YtDlpExtractorOptions>,
    ) {
        super(context, options)
        this.options = {
            executablePath: 'yt-dlp',
            outputFormat: 'best[height<=720]',
            maxDuration: 3600,
            timeout: 30000,
            ...options,
        }
        // this._config = {
        //     identifier: "ytdlp",
        //     name: "yt-dlp Extractor",
        //     description: "Custom yt-dlp-based extractor for Discord Player",
        //     version: "1.0.0"
        // }
    }

    async validate(query: string): Promise<boolean> {
        return (
            query.includes('youtube.com') ||
            query.includes('youtu.be') ||
            query.includes('youtube.com/watch') ||
            query.includes('youtube.com/playlist') ||
            query.includes('youtube.com/channel') ||
            query.includes('youtube.com/c/') ||
            query.includes('youtube.com/user/') ||
            query.includes('youtube.com/@') ||
            query.length > 0
        )
    }

    async handle(
        query: string,
        _context: ExtractorSearchContext,
    ): Promise<ExtractorInfo> {
        try {
            debugLog({ message: `yt-dlp extractor handling query: ${query}` })

            const result = await this.executeYtDlp(query)

            if (result.success && result.tracks) {
                return {
                    tracks: result.tracks as Track<unknown>[],
                    playlist: null,
                }
            } else {
                throw new Error(result.error ?? 'yt-dlp extraction failed')
            }
        } catch (error) {
            errorLog({ message: 'yt-dlp extraction error:', error })
            throw error
        }
    }

    private buildYtDlpArgs(query: string): string[] {
        return [
            query,
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
            this.options.outputFormat,
            '--max-duration',
            this.options.maxDuration.toString(),
        ]
    }

    private setupProcessHandlers(
        process: { stdout?: { on: (event: string, callback: (data: Buffer) => void) => void }; stderr?: { on: (event: string, callback: (data: Buffer) => void) => void }; on: (event: string, callback: (code: number | null) => void) => void; kill: () => void },
        resolve: (result: YtDlpExtractorResult) => void,
    ): void {
        let stdout = ''
        let stderr = ''

        process.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString()
        })

        process.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString()
        })

        process.on('close', (code: number | null) => {
            if (code === 0) {
                const tracks = this.parseOutput(stdout)
                resolve({
                    success: true,
                    tracks,
                })
            } else {
                resolve({
                    success: false,
                    error: stderr || `Process exited with code ${code}`,
                })
            }
        })

        process.on('error', (error: unknown) => {
            resolve({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            })
        })

        setTimeout(() => {
            process.kill()
            resolve({
                success: false,
                error: 'yt-dlp timeout',
            })
        }, this.options.timeout)
    }

    private async executeYtDlp(query: string): Promise<YtDlpExtractorResult> {
        return new Promise((resolve) => {
            const args = this.buildYtDlpArgs(query)
            const process = spawn(this.options.executablePath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            })
            this.setupProcessHandlers(process, resolve)
        })
    }

    private parseOutput(_output: string): unknown[] {
        // TODO: Implement output parsing
        return []
    }
}
