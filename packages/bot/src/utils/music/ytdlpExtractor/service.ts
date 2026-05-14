import {
    BaseExtractor,
    type ExtractorInfo,
    type ExtractorSearchContext,
    type ExtractorExecutionContext,
    type Track,
} from 'discord-player'
import { spawn } from 'child_process'
import { errorLog, debugLog } from '@lucky/shared/utils'
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

    private spawnYtDlp(query: string, timeoutMs: number): Promise<YtDlpExtractorResult> {
        return new Promise((resolve) => {
            const args = this.buildYtDlpArgs(query)
            const proc = spawn(this.options.executablePath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            let stdout = ''
            let stderr = ''
            let settled = false

            const settle = (result: YtDlpExtractorResult): void => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve(result)
            }

            const timer = setTimeout(() => {
                proc.kill()
                settle({ success: false, error: 'yt-dlp timeout' })
            }, timeoutMs)

            proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
            proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

            proc.on('close', (code: number | null) => {
                if (code === 0) {
                    settle({ success: true, tracks: this.parseOutput(stdout) })
                } else {
                    settle({ success: false, error: stderr || `Process exited with code ${code}` })
                }
            })

            proc.on('error', (error: unknown) => {
                settle({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                })
            })
        })
    }

    private async executeYtDlp(query: string): Promise<YtDlpExtractorResult> {
        const baseTimeout = this.options.timeout
        const timeouts = [baseTimeout, Math.round(baseTimeout * 1.5), baseTimeout * 2]

        for (let attempt = 0; attempt < timeouts.length; attempt++) {
            if (attempt > 0) {
                debugLog({ message: `yt-dlp retry attempt ${attempt + 1} for query: ${query}` })
            }

            const result = await this.spawnYtDlp(query, timeouts[attempt])

            if (result.success) return result

            const isLastAttempt = attempt === timeouts.length - 1
            if (isLastAttempt) return result

            debugLog({ message: `yt-dlp attempt ${attempt + 1} failed (${result.error}), retrying…` })
        }

        return { success: false, error: 'yt-dlp exhausted all retries' }
    }

    private parseOutput(_output: string): unknown[] {
        return []
    }
}
