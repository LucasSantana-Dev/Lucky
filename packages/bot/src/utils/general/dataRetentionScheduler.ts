import { DatabaseService } from '@lucky/shared/services'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { IntervalScheduler } from './IntervalScheduler'

// Tick once a day to prune data past its retention window (track history,
// expired rate limits, server logs; see DatabaseService.cleanupOldData).
const DEFAULT_TICK_INTERVAL_MS = 24 * 60 * 60 * 1000

const DEFAULT_GUILD_PURGE_GRACE_DAYS = 30
// Upper bound so a huge value cannot overflow the cutoff date.
const MAX_GUILD_PURGE_GRACE_DAYS = 3650

const databaseService = new DatabaseService()

/** Departed-guild purge (#2377) is off unless GUILD_DATA_PURGE_ENABLED=true. */
function isGuildPurgeEnabled(): boolean {
    return process.env.GUILD_DATA_PURGE_ENABLED === 'true'
}

function guildPurgeGraceDays(): number {
    const raw = process.env.GUILD_DATA_PURGE_GRACE_DAYS
    if (raw === undefined || !/^\d+$/.test(raw.trim())) {
        return DEFAULT_GUILD_PURGE_GRACE_DAYS
    }
    const days = Number(raw.trim())
    return days >= 1 && days <= MAX_GUILD_PURGE_GRACE_DAYS
        ? days
        : DEFAULT_GUILD_PURGE_GRACE_DAYS
}

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
        } else {
            infoLog({
                message: `Data retention sweep deleted ${result.getData()} row(s)`,
            })
        }

        if (isGuildPurgeEnabled()) await this.purgeDepartedGuilds()
    }

    /** Logs counts per table only, never row content. */
    private async purgeDepartedGuilds(): Promise<void> {
        const graceDays = guildPurgeGraceDays()
        const result = await databaseService.purgeDepartedGuildData(graceDays)
        if (result.isFailure()) {
            errorLog({
                message: 'Departed-guild purge failed',
                error: result.getError(),
            })
            return
        }
        const summary = result.getData()
        if (!summary || summary.guilds === 0) {
            infoLog({
                message: `Departed-guild purge: no guild past the ${graceDays}-day grace period`,
            })
            return
        }
        const perTable = Object.entries(summary.deleted)
            .map(([table, count]) => `${table}=${count}`)
            .join(', ')
        infoLog({
            message: perTable
                ? `Departed-guild purge over ${summary.guilds} guild(s) deleted: ${perTable}`
                : `Departed-guild purge over ${summary.guilds} guild(s): nothing left to delete`,
        })
    }
}

/** Singleton instance of DataRetentionScheduler. */
export const dataRetentionScheduler = new DataRetentionScheduler()
