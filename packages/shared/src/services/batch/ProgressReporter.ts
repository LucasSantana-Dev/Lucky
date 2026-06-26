import type { BatchProgress } from './types.js'

/**
 * Computes progress metrics and formats a human-readable progress string.
 * Framework-agnostic — no Discord.js dependencies.
 */
export class ProgressReporter {
    /**
     * Computes progress percentage and ETA from current state and start time.
     *
     * @param processed Number of items successfully processed
     * @param total Total number of items
     * @param startTime Unix timestamp (ms) when processing started
     * @param failed Number of items that failed (defaults to 0)
     * @param skipped Number of items skipped (defaults to 0)
     * @returns BatchProgress object with computed metrics
     */
    static compute(
        processed: number,
        total: number,
        startTime: number,
        failed: number = 0,
        skipped: number = 0,
    ): BatchProgress {
        const percentComplete = total > 0 ? (processed / total) * 100 : 0
        const elapsedMs = Date.now() - startTime
        const elapsedSeconds = elapsedMs / 1000

        let eta: string | undefined
        if (processed > 0 && percentComplete < 100) {
            const avgTimePerItem = elapsedSeconds / processed
            const remainingItems = total - processed
            const remainingSeconds = avgTimePerItem * remainingItems

            const hours = Math.floor(remainingSeconds / 3600)
            const minutes = Math.floor((remainingSeconds % 3600) / 60)
            const seconds = Math.floor(remainingSeconds % 60)

            if (hours > 0) {
                eta = `${hours}h ${minutes}m`
            } else if (minutes > 0) {
                eta = `${minutes}m ${seconds}s`
            } else {
                eta = `${seconds}s`
            }
        }

        const message = this.formatMessage(
            processed,
            total,
            percentComplete,
            failed,
            skipped,
            eta,
        )

        return {
            processed,
            failed,
            skipped,
            total,
            percentComplete,
            eta,
            message,
        }
    }

    /**
     * Formats a progress message string.
     */
    private static formatMessage(
        processed: number,
        total: number,
        percent: number,
        failed: number,
        skipped: number,
        eta?: string,
    ): string {
        const progressBar = this.progressBar(percent)
        const failedStr = failed > 0 ? ` | Failed: ${failed}` : ''
        const skippedStr = skipped > 0 ? ` | Skipped: ${skipped}` : ''
        const etaStr = eta ? ` | ETA: ${eta}` : ''

        return `${progressBar} ${processed}/${total} (${percent.toFixed(1)}%)${failedStr}${skippedStr}${etaStr}`
    }

    /**
     * Generates a visual progress bar (20 chars wide).
     */
    private static progressBar(percent: number): string {
        const width = 20
        const filled = Math.floor((percent / 100) * width)
        const empty = width - filled
        const bar = '█'.repeat(filled) + '░'.repeat(empty)
        return `[${bar}]`
    }
}
