import type { GuildQueue } from 'discord-player'
import { debugLog, errorLog } from '@lucky/shared/utils'

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

export class MusicWatchdogService {
    private readonly timeoutMs: number
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly states = new Map<string, WatchdogGuildState>()

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

    getGuildState(guildId: string): WatchdogGuildState {
        return { ...this.ensureState(guildId) }
    }

    getAllStates(): WatchdogGuildState[] {
        return Array.from(this.states.values()).map((state) => ({ ...state }))
    }
}

export const musicWatchdogService = new MusicWatchdogService()
