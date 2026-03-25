import type { GuildQueue, Player } from 'discord-player'
import type { VoiceChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
import { redisClient } from '@lucky/shared/services'
import { musicSessionSnapshotService } from './sessionSnapshots'

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
const SESSION_KEY_PREFIX = 'music:session:'
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000

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
    private orphanMonitorInterval: ReturnType<typeof setInterval> | null = null

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

    startOrphanSessionMonitor(
        player: Player,
        intervalMs = 60_000,
    ): void {
        if (this.orphanMonitorInterval) return

        this.orphanMonitorInterval = setInterval(() => {
            void this.scanOrphanSessions(player)
        }, intervalMs)

        debugLog({ message: 'Music watchdog orphan session monitor started' })
    }

    stopOrphanSessionMonitor(): void {
        if (this.orphanMonitorInterval) {
            clearInterval(this.orphanMonitorInterval)
            this.orphanMonitorInterval = null
        }
    }

    async scanOrphanSessions(player: Player): Promise<void> {
        if (!redisClient.isHealthy()) return

        let sessionKeys: string[]
        try {
            sessionKeys = await redisClient.keys(`${SESSION_KEY_PREFIX}*`)
        } catch (error) {
            errorLog({ message: 'Watchdog failed to scan session keys', error })
            return
        }

        for (const key of sessionKeys) {
            const guildId = key.slice(SESSION_KEY_PREFIX.length)
            try {
                await this.recoverOrphanSession(player, guildId)
            } catch (error) {
                errorLog({
                    message: 'Watchdog orphan recovery error',
                    error,
                    data: { guildId },
                })
            }
        }
    }

    private async recoverOrphanSession(
        player: Player,
        guildId: string,
    ): Promise<void> {
        const existingQueue = player.nodes.get(guildId)
        if (existingQueue?.node.isPlaying()) return

        const snapshot = await musicSessionSnapshotService.getSnapshot(guildId)
        if (!snapshot) return

        const ageMs = Date.now() - snapshot.savedAt
        if (ageMs > SNAPSHOT_MAX_AGE_MS) return

        const guild = player.client.guilds.cache.get(guildId)
        if (!guild) return

        const voiceChannelId = snapshot.voiceChannelId
        if (!voiceChannelId) return

        const channel = guild.channels.cache.get(voiceChannelId)
        if (!channel || channel.type !== ChannelType.GuildVoice) return

        const voiceChannel = channel as VoiceChannel
        const membersInChannel = voiceChannel.members.filter((m) => !m.user.bot)
        if (membersInChannel.size === 0) return

        infoLog({
            message: 'Watchdog detected orphan session, attempting rejoin',
            data: { guildId, voiceChannelId, snapshotAgeMs: ageMs },
        })

        const queue = existingQueue ?? player.nodes.create(guild)
        if (!existingQueue) {
            queue.setRepeatMode(3)
            await queue.connect(voiceChannel)
        }

        const restoreResult = await musicSessionSnapshotService.restoreSnapshot(
            queue,
        )
        if (!restoreResult || restoreResult.restoredCount <= 0) {
            await musicSessionSnapshotService.deleteSnapshot(guildId)

            const state = this.ensureState(guildId)
            state.lastRecoveryAction = 'failed'
            state.lastRecoveryAt = Date.now()
            state.lastRecoveryDetail = 'snapshot_restore_empty'

            infoLog({
                message: 'Watchdog orphan session restore produced no tracks; snapshot cleared',
                data: { guildId, voiceChannelId },
            })
            return
        }

        const state = this.ensureState(guildId)
        state.lastRecoveryAction = 'rejoin'
        state.lastRecoveryAt = Date.now()

        infoLog({
            message: 'Watchdog orphan session recovered',
            data: { guildId },
        })
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
