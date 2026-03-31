import RedisClientClass, { type Redis } from 'ioredis'
import { randomUUID } from 'crypto'
import { createRedisConfig } from '../redis/config.js'
import { debugLog, errorLog, infoLog } from '../../utils/general/log.js'
import {
    CHANNEL_COMMAND,
    CHANNEL_STATE,
    CHANNEL_RESULT,
    STATE_KEY_PREFIX,
    STATE_TTL,
    type MusicCommand,
    type MusicCommandResult,
    type QueueState,
    type PendingResult,
} from './types.js'

export class MusicControlService {
    private publisher: Redis | null = null
    private subscriber: Redis | null = null
    private pendingResults = new Map<string, PendingResult>()

    async connect(): Promise<void> {
        try {
            const config = createRedisConfig()
            this.publisher = new RedisClientClass(config) as Redis
            this.subscriber = new RedisClientClass(config) as Redis
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect(),
            ])
            infoLog({ message: 'MusicControlService connected to Redis' })
        } catch (error) {
            errorLog({
                message: 'MusicControlService failed to connect:',
                error,
            })
        }
    }

    async disconnect(): Promise<void> {
        try {
            if (this.subscriber) {
                await this.subscriber.unsubscribe()
                await this.subscriber.disconnect()
            }
            if (this.publisher) await this.publisher.disconnect()
            debugLog({ message: 'MusicControlService disconnected' })
        } catch (error) {
            errorLog({
                message: 'MusicControlService disconnect error:',
                error,
            })
        }
    }

    async sendCommand(
        cmd: MusicCommand,
        timeoutMs = 10000,
    ): Promise<MusicCommandResult> {
        if (!this.publisher) {
            return this.failResult(cmd, 'Not connected')
        }
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.pendingResults.delete(cmd.id)
                resolve(this.failResult(cmd, 'Command timed out'))
            }, timeoutMs)

            this.pendingResults.set(cmd.id, { resolve, timeout })

            this.publisher!.publish(CHANNEL_COMMAND, JSON.stringify(cmd)).catch(
                (err) => {
                    this.pendingResults.delete(cmd.id)
                    clearTimeout(timeout)
                    resolve(
                        this.failResult(cmd, `Publish failed: ${err.message}`),
                    )
                },
            )
        })
    }

    async subscribeToCommands(
        handler: (cmd: MusicCommand) => Promise<void>,
    ): Promise<void> {
        if (!this.subscriber) return
        await this.subscriber.subscribe(CHANNEL_COMMAND)
        this.subscriber.on('message', async (ch: string, msg: string) => {
            if (ch !== CHANNEL_COMMAND) return
            try {
                await handler(JSON.parse(msg) as MusicCommand)
            } catch (error) {
                errorLog({ message: 'Error handling music command:', error })
            }
        })
        infoLog({ message: 'Subscribed to music commands' })
    }

    async sendResult(result: MusicCommandResult): Promise<void> {
        if (!this.publisher) return
        try {
            await this.publisher.publish(CHANNEL_RESULT, JSON.stringify(result))
        } catch (error) {
            errorLog({ message: 'Error publishing music result:', error })
        }
    }

    async subscribeToResults(): Promise<void> {
        if (!this.subscriber) return
        await this.subscriber.subscribe(CHANNEL_RESULT)
        this.subscriber.on('message', (ch: string, msg: string) => {
            if (ch !== CHANNEL_RESULT) return
            try {
                const result = JSON.parse(msg) as MusicCommandResult
                const pending = this.pendingResults.get(result.id)
                if (!pending) return
                clearTimeout(pending.timeout)
                this.pendingResults.delete(result.id)
                pending.resolve(result)
            } catch (error) {
                errorLog({ message: 'Error handling music result:', error })
            }
        })
    }

    async publishState(state: QueueState): Promise<void> {
        if (!this.publisher) return
        try {
            const json = JSON.stringify(state)
            await Promise.all([
                this.publisher.publish(CHANNEL_STATE, json),
                this.publisher.setex(
                    `${STATE_KEY_PREFIX}${state.guildId}`,
                    STATE_TTL,
                    json,
                ),
            ])
        } catch (error) {
            errorLog({ message: 'Error publishing music state:', error })
        }
    }

    async subscribeToState(
        handler: (state: QueueState) => void,
    ): Promise<void> {
        if (!this.subscriber) return
        await this.subscriber.subscribe(CHANNEL_STATE)
        this.subscriber.on('message', (ch: string, msg: string) => {
            if (ch !== CHANNEL_STATE) return
            try {
                handler(JSON.parse(msg) as QueueState)
            } catch (error) {
                errorLog({ message: 'Error handling music state:', error })
            }
        })
    }

    async getState(guildId: string): Promise<QueueState | null> {
        if (!this.publisher) return null
        try {
            const json = await this.publisher.get(
                `${STATE_KEY_PREFIX}${guildId}`,
            )
            return json ? (JSON.parse(json) as QueueState) : null
        } catch (error) {
            errorLog({ message: 'Error getting music state:', error })
            return null
        }
    }

    static createCommandId(): string {
        return `cmd_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 7)}`
    }

    private failResult(cmd: MusicCommand, error: string): MusicCommandResult {
        return {
            id: cmd.id,
            guildId: cmd.guildId,
            success: false,
            error,
            timestamp: Date.now(),
        }
    }
}

export const musicControlService = new MusicControlService()
