import type { GuildQueue } from 'discord-player'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import { redisClient } from '@lucky/shared/services'

export type RecoveryAction =
    | 'none'
    | 'rejoin'
    | 'requeue_current'
    | 'play_next'
    | 'failed'

export type WatchdogGuildState = {
    guildId: string
    timeoutMs: number
    lastActivityAt: number | null
    lastRecoveryAt: number | null
    lastRecoveryAction: RecoveryAction
    lastRecoveryDetail: string | null
}

const SNAPSHOT_KEY_PREFIX = 'music:session:'

type MusicWatchdogOptions = {
    timeoutMs?: number
    recoveryWaitTimeoutMs?: number
    recoveryPollIntervalMs?: number
    scanIntervalMs?: number
}

export class MusicWatchdogService {
    private readonly timeoutMs: number
    private readonly recoveryWaitTimeoutMs: number
    private readonly recoveryPollIntervalMs: number
    private readonly scanIntervalMs: number
    private scanTimer: ReturnType<typeof setInterval> | null = null
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly states = new Map<string, WatchdogGuildState>()

    constructor(options: MusicWatchdogOptions = {}) {
        this.timeoutMs =
            options.timeoutMs ??
            parseInt(process.env.MUSIC_WATCHDOG_TIMEOUT_MS ?? '25000', 10)
        this.recoveryWaitTimeoutMs =
            options.recoveryWaitTimeoutMs ??
            parseInt(process.env.MUSIC_WATCHDOG_RECOVERY_WAIT_MS ?? '1500', 10)
        this.recoveryPollIntervalMs =
            options.recoveryPollIntervalMs ??
            parseInt(process.env.MUSIC_WATCHDOG_RECOVERY_POLL_MS ?? '100', 10)
        this.scanIntervalMs =
            options.scanIntervalMs ??
            parseInt(process.env.MUSIC_WATCHDOG_SCAN_INTERVAL_MS ?? '60000', 10)
    }

    private ensureState(guildId: string): WatchdogGuildState {
        const existing = this.states.get(guildId)
        if (existing) return existing
        const created: WatchdogGuildState = {
            guildId,
            timeoutMs: this.timeoutMs,
            lastActivityAt: null,
            lastRecoveryAt: null,
            lastRecoveryAction: 'none',
            lastRecoveryDetail: null,
        }
        this.states.set(guildId, created)
        return created
    }

    private async waitForConnectionReady(
        connection: GuildQueue['connection'],
    ): Promise<boolean> {
        if (!connection) return true
        if (this.isConnectionReady(connection)) return true

        const deadline = Date.now() + this.recoveryWaitTimeoutMs
        while (Date.now() < deadline) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.recoveryPollIntervalMs),
            )

            if (this.isConnectionReady(connection)) {
                return true
            }
        }

        return this.isConnectionReady(connection)
    }

    private isConnectionReady(connection: GuildQueue['connection']): boolean {
        return connection?.state?.status === 'ready'
    }

    touch(guildId: string, now = Date.now()): void {
        const state = this.ensureState(guildId)
        state.lastActivityAt = now
    }

    clear(guildId: string): void {
        const timer = this.timers.get(guildId)
        if (timer) {
            clearTimeout(timer)
            this.timers.delete(guildId)
        }
    }

    arm(queue: GuildQueue): void {
        const guildId = queue.guild.id
        this.clear(guildId)
        this.touch(guildId)

        const timer = setTimeout(() => {
            void this.checkAndRecover(queue)
        }, this.timeoutMs)
        this.timers.set(guildId, timer)
    }

    async checkAndRecover(queue: GuildQueue): Promise<RecoveryAction> {
        const guildId = queue.guild.id
        const state = this.ensureState(guildId)

        if (queue.node.isPlaying()) {
            state.lastRecoveryAction = 'none'
            state.lastRecoveryDetail = 'queue_playing'
            return 'none'
        }

        let action: RecoveryAction = 'none'
        let detail = 'nothing_to_recover'
        let didRejoin = false
        try {
            if (queue.connection?.state?.status !== 'ready') {
                queue.connection?.rejoin?.()
                didRejoin = true
                const ready = await this.waitForConnectionReady(queue.connection)
                if (!ready) {
                    action = 'failed'
                    detail = 'connection_not_ready_after_rejoin'
                    state.lastRecoveryAction = action
                    state.lastRecoveryDetail = detail
                    state.lastRecoveryAt = Date.now()
                    return action
                }
            }

            if (queue.currentTrack) {
                await queue.node.play()
                action = 'requeue_current'
                detail = didRejoin
                    ? 'rejoined_and_requeued_current'
                    : 'requeue_current'
            } else if (queue.tracks.size > 0) {
                await queue.node.play()
                action = 'play_next'
                detail = 'started_next_track'
            }
        } catch (error) {
            action = 'failed'
            detail =
                error instanceof Error
                    ? `recovery_failed:${error.message}`
                    : `recovery_failed:${String(error)}`
            errorLog({
                message: 'Music watchdog recovery failed',
                error,
                data: { guildId },
            })
        }

        state.lastRecoveryAction = action
        state.lastRecoveryDetail = detail
        state.lastRecoveryAt = Date.now()

        debugLog({
            message: 'Music watchdog recovery result',
            data: { guildId, action, detail },
        })

        return action
    }

    getGuildState(guildId: string): WatchdogGuildState {
        return { ...this.ensureState(guildId) }
    }

    getAllStates(): WatchdogGuildState[] {
        return Array.from(this.states.values()).map((state) => ({ ...state }))
    }

    async scanOrphanedSessions(
        getQueue: (guildId: string) => GuildQueue | null,
    ): Promise<string[]> {
        const recovered: string[] = []
        try {
            const keys = await redisClient.keys(`${SNAPSHOT_KEY_PREFIX}*`)
            for (const key of keys) {
                const guildId = key.slice(SNAPSHOT_KEY_PREFIX.length)
                const queue = getQueue(guildId)
                if (!queue) continue
                if (queue.node.isPlaying()) continue
                if (this.timers.has(guildId)) continue

                debugLog({
                    message: 'Watchdog scan: arming orphaned session',
                    data: { guildId },
                })
                this.arm(queue)
                recovered.push(guildId)
            }
        } catch (error) {
            errorLog({
                message: 'Watchdog periodic scan failed',
                error,
            })
        }
        return recovered
    }

    startPeriodicScan(
        getQueue: (guildId: string) => GuildQueue | null,
    ): void {
        if (this.scanTimer) return

        infoLog({
            message: `Music watchdog periodic scan started (interval: ${this.scanIntervalMs}ms)`,
        })

        this.scanTimer = setInterval(() => {
            void this.scanOrphanedSessions(getQueue)
        }, this.scanIntervalMs)
    }

    stopPeriodicScan(): void {
        if (this.scanTimer) {
            clearInterval(this.scanTimer)
            this.scanTimer = null
        }
    }
}

export const musicWatchdogService = new MusicWatchdogService()
