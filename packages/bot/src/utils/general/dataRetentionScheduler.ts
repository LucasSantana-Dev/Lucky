import { DatabaseService } from '@lucky/shared/services'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { IntervalScheduler } from './IntervalScheduler'

// Tick once a day to prune data past its retention window (track history,
// expired rate limits, server logs; see DatabaseService.cleanupOldData).
const DEFAULT_TICK_INTERVAL_MS = 24 * 60 * 60 * 1000

// DatabaseConfig is accepted by the constructor but not read by
// DatabaseService today (it talks to the shared getPrismaClient() singleton
// regardless of these values); kept only to satisfy the required shape.
const databaseService = new DatabaseService({
    url: process.env.DATABASE_URL ?? '',
    ttl: 3600,
    maxConnections: 10,
    connectionTimeout: 5000,
})

/**
 * Runs DatabaseService.cleanupOldData() once a day to prune track history,
 * expired rate limits, and server logs older than 30 days (#2369). Server
 * logs store deleted/edited message text, so this sweep is a privacy
 * requirement, not just housekeeping.
 */
export class DataRetentionScheduler extends IntervalScheduler {
    constructor(tickIntervalMs: number = DEFAULT_TICK_INTERVAL_MS) {
        super(tickIntervalMs)
    }

    /** Sweep once immediately on startup so retention doesn't wait a full day
     * after a fresh deploy (matches the other IntervalScheduler subclasses). */
    protected onStart(): void {
        void this.tick()
    }

    protected async execute(): Promise<void> {
        const result = await databaseService.cleanupOldData()
        if (result.isFailure()) {
            errorLog({
                message: 'Data retention sweep failed',
                error: result.getError(),
            })
            return
        }
        infoLog({
            message: `Data retention sweep deleted ${result.getData()} row(s)`,
        })
    }
}

/** Singleton instance of DataRetentionScheduler. */
export const dataRetentionScheduler = new DataRetentionScheduler()
