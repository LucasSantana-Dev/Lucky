import { redisClient } from '../../../config/redis'
import { debugLog, errorLog } from '../../../utils/general/log'
import type { QueueSession, SessionConfig, QueueSessionOptions } from './types'

/**
 * Queue session manager service
 */
export class QueueSessionManagerService {
    constructor(private readonly config: SessionConfig) {}

    async createQueueSession(session: QueueSession): Promise<boolean> {
        try {
            const key = `queue_session:${session.guildId}`
            const sessionData = JSON.stringify(session)

            const success = await redisClient.setex(
                key,
                this.config.queueSessionTtl,
                sessionData,
            )

            if (success) {
                debugLog({
                    message: `Created queue session for guild ${session.guildId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to create queue session:', error })
            return false
        }
    }

    async getQueueSession(guildId: string): Promise<QueueSession | null> {
        try {
            const key = `queue_session:${guildId}`
            const sessionData = await redisClient.get(key)

            if (sessionData) {
                return JSON.parse(sessionData) as QueueSession
            }

            return null
        } catch (error) {
            errorLog({ message: 'Failed to get queue session:', error })
            return null
        }
    }

    async updateQueueSession(session: QueueSession): Promise<boolean> {
        try {
            const key = `queue_session:${session.guildId}`
            const sessionData = JSON.stringify(session)

            const success = await redisClient.setex(
                key,
                this.config.queueSessionTtl,
                sessionData,
            )

            if (success) {
                debugLog({
                    message: `Updated queue session for guild ${session.guildId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to update queue session:', error })
            return false
        }
    }

    async deleteQueueSession(guildId: string): Promise<boolean> {
        try {
            const key = `queue_session:${guildId}`
            const success = await redisClient.del(key)

            if (success) {
                debugLog({
                    message: `Deleted queue session for guild ${guildId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to delete queue session:', error })
            return false
        }
    }

    async clearAllQueueSessions(): Promise<boolean> {
        try {
            const keys = await redisClient.smembers('queue_session_keys')
            if (keys.length > 0) {
                for (const key of keys) {
                    await redisClient.del(key)
                }
                await redisClient.del('queue_session_keys')
            }

            debugLog({ message: 'Cleared all queue sessions' })
            return true
        } catch (error) {
            errorLog({ message: 'Failed to clear all queue sessions:', error })
            return false
        }
    }

    async createQueueSessionFromOptions(
        options: QueueSessionOptions,
    ): Promise<QueueSession> {
        return {
            guildId: options.guildId,
            channelId: options.channelId,
            voiceChannelId: options.voiceChannelId,
            queuePosition: 0,
            isPlaying: false,
            volume: options.volume ?? 50,
            repeatMode: options.repeatMode ?? 0,
            lastUpdated: Date.now(),
        }
    }

    async updateQueuePosition(
        guildId: string,
        position: number,
    ): Promise<boolean> {
        try {
            const session = await this.getQueueSession(guildId)
            if (!session) return false

            session.currentPosition = position
            return await this.updateQueueSession(session)
        } catch (error) {
            errorLog({ message: 'Failed to update queue position:', error })
            return false
        }
    }

    async updatePlayingState(
        guildId: string,
        isPlaying: boolean,
    ): Promise<boolean> {
        try {
            const session = await this.getQueueSession(guildId)
            if (!session) return false

            session.isPlaying = isPlaying
            return await this.updateQueueSession(session)
        } catch (error) {
            errorLog({ message: 'Failed to update playing state:', error })
            return false
        }
    }

    async updateVolume(guildId: string, volume: number): Promise<boolean> {
        try {
            const session = await this.getQueueSession(guildId)
            if (!session) return false

            session.volume = volume
            return await this.updateQueueSession(session)
        } catch (error) {
            errorLog({ message: 'Failed to update volume:', error })
            return false
        }
    }

    async updateRepeatMode(
        guildId: string,
        repeatMode: number,
    ): Promise<boolean> {
        try {
            const session = await this.getQueueSession(guildId)
            if (!session) return false

            session.repeatMode = repeatMode
            return await this.updateQueueSession(session)
        } catch (error) {
            errorLog({ message: 'Failed to update repeat mode:', error })
            return false
        }
    }
}
