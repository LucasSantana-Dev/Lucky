import type { GuildQueue, Player } from 'discord-player'
import type { VoiceChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog } from '@lucky/shared/utils'
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
}

type MusicWatchdogOptions = {
    timeoutMs?: number
}

const SESSION_KEY_PREFIX = 'music:session:'
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000

export class MusicWatchdogService {
    private readonly timeoutMs: number
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly states = new Map<string, WatchdogGuildState>()
    private orphanMonitorInterval: ReturnType<typeof setInterval> | null = null

    constructor(options: MusicWatchdogOptions = {}) {
        this.timeoutMs =
            options.timeoutMs ??
            parseInt(process.env.MUSIC_WATCHDOG_TIMEOUT_MS ?? '25000', 10)
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
        }
        this.states.set(guildId, created)
        return created
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
            return 'none'
        }

        let action: RecoveryAction = 'none'
        try {
            if (queue.connection?.state?.status !== 'ready') {
                queue.connection?.rejoin?.()
                action = 'rejoin'
            }

            if (queue.currentTrack) {
                await queue.node.play()
                action = 'requeue_current'
            } else if (queue.tracks.size > 0) {
                await queue.node.play()
                action = 'play_next'
            }
        } catch (error) {
            action = 'failed'
            errorLog({
                message: 'Music watchdog recovery failed',
                error,
                data: { guildId },
            })
        }

        state.lastRecoveryAction = action
        state.lastRecoveryAt = Date.now()

        debugLog({
            message: 'Music watchdog recovery result',
            data: { guildId, action },
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

        const queue = player.nodes.create(guild)
        queue.setRepeatMode(3)

        await queue.connect(voiceChannel)
        await musicSessionSnapshotService.restoreSnapshot(queue)

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
}

export const musicWatchdogService = new MusicWatchdogService()
