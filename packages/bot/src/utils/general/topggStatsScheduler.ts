import { infoLog, warnLog } from '@lucky/shared/utils'
import { TOP_GG_BOT_ID } from '@lucky/shared/constants/topgg'
import { addBreadcrumb, captureMessage } from '../monitoring/sentry'

import { IntervalScheduler } from './IntervalScheduler'

// Tick every 30 minutes to post stats
const DEFAULT_TICK_INTERVAL_MS = 30 * 60 * 1000

type TopggStatsSchedulerOptions = {
    tickIntervalMs?: number
    fetch?: typeof fetch
}

export class TopggStatsScheduler extends IntervalScheduler {
    private readonly fetchFn: typeof fetch
    private loggedMissingToken = false

    constructor(options: TopggStatsSchedulerOptions = {}) {
        super(options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS)
        this.fetchFn = options.fetch ?? fetch
    }

    protected onStart(): void {
        const token = process.env.TOPGG_TOKEN
        if (!token) {
            if (!this.loggedMissingToken) {
                infoLog({
                    message: 'TOPGG_TOKEN not set — Top.gg stats posting disabled',
                })
                this.loggedMissingToken = true
            }
            return
        }

        infoLog({
            message: `Top.gg stats scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        // Run once immediately on startup so stats are posted right after bot connects
        void this.tick()
    }

    protected async execute(): Promise<void> {
        const token = process.env.TOPGG_TOKEN
        if (!token) {
            // Silently return — already logged once at startup
            return
        }

        if (!this.client) return

        const serverCount = this.client.guilds.cache.size

        try {
            const response = await this.fetchFn(
                `https://top.gg/api/bots/${TOP_GG_BOT_ID}/stats`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ server_count: serverCount }),
                },
            )

            if (!response.ok) {
                const text = await response.text()
                const statusText = response.statusText || `HTTP ${response.status}`
                warnLog({
                    message: `Top.gg stats POST failed: ${statusText}`,
                    data: {
                        status: response.status,
                        statusText,
                        serverCount,
                        responseBody: text.slice(0, 500), // Log first 500 chars
                    },
                })

                addBreadcrumb(
                    `Top.gg stats POST failed: ${statusText}`,
                    'topgg.stats',
                    'warning',
                    { status: response.status, serverCount },
                )

                captureMessage(
                    `Top.gg stats POST failed: ${statusText} (status ${response.status})`,
                    'warning',
                    { category: 'topgg.stats', serverCount, status: response.status },
                )
                return
            }

            infoLog({
                message: 'Top.gg stats posted successfully',
                data: { serverCount },
            })
        } catch (error) {
            warnLog({
                message: 'Top.gg stats POST request failed',
                error: error as Error,
                data: { serverCount },
            })

            addBreadcrumb(
                'Top.gg stats POST request failed',
                'topgg.stats',
                'warning',
                { error: String(error), serverCount },
            )

            captureMessage(
                `Top.gg stats POST request failed: ${String(error)}`,
                'warning',
                { category: 'topgg.stats', serverCount },
            )
        }
    }
}

export const topggStatsScheduler = new TopggStatsScheduler()
