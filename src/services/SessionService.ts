import { redisClient } from "../config/redis"
import { debugLog, errorLog } from "../utils/general/log"
import { ENVIRONMENT_CONFIG } from "../config/environmentConfig"

export type UserSession = {
    userId: string
    guildId: string
    channelId: string
    lastActivity: number
    commandHistory: string[]
    preferences: Record<string, unknown>
}

export type QueueSession = {
    guildId: string
    channelId: string
    voiceChannelId: string
    lastTrackId?: string
    queuePosition: number
    isPlaying: boolean
    volume: number
    repeatMode: number
    lastUpdated: number
}

class SessionService {
    private readonly USER_SESSION_TTL =
        ENVIRONMENT_CONFIG.SESSIONS.USER_SESSION_TTL
    private readonly QUEUE_SESSION_TTL =
        ENVIRONMENT_CONFIG.SESSIONS.QUEUE_SESSION_TTL
    private readonly COMMAND_HISTORY_LIMIT =
        ENVIRONMENT_CONFIG.SESSIONS.COMMAND_HISTORY_LIMIT

    private getUserSessionKey(userId: string, guildId: string): string {
        return `user_session:${userId}:${guildId}`
    }

    private getQueueSessionKey(guildId: string): string {
        return `queue_session:${guildId}`
    }

    async getUserSession(
        userId: string,
        guildId: string,
    ): Promise<UserSession | null> {
        try {
            const sessionKey = this.getUserSessionKey(userId, guildId)
            const sessionData = await redisClient.get(sessionKey)

            if (!sessionData) {
                return null
            }

            return JSON.parse(sessionData) as UserSession
        } catch (error) {
            errorLog({
                message: "Error getting user session from Redis:",
                error,
            })
            return null
        }
    }

    /**
     * Set user session
     */
    async setUserSession(session: UserSession): Promise<boolean> {
        try {
            const sessionKey = this.getUserSessionKey(
                session.userId,
                session.guildId,
            )

            // Update last activity
            session.lastActivity = Date.now()

            const success = await redisClient.set(
                sessionKey,
                JSON.stringify(session),
                this.USER_SESSION_TTL,
            )

            if (success) {
                debugLog({
                    message: `Updated user session for ${session.userId} in ${session.guildId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: "Error setting user session in Redis:", error })
            return false
        }
    }

    /**
     * Update user session activity
     */
    async updateUserActivity(
        userId: string,
        guildId: string,
        channelId: string,
        commandName?: string,
    ): Promise<boolean> {
        try {
            const existingSession = await this.getUserSession(userId, guildId)

            const session: UserSession = {
                userId,
                guildId,
                channelId,
                lastActivity: Date.now(),
                commandHistory: existingSession?.commandHistory ?? [],
                preferences: existingSession?.preferences ?? {},
            }

            // Add command to history if provided
            if (commandName) {
                session.commandHistory.unshift(commandName)
                // Keep only recent commands
                session.commandHistory = session.commandHistory.slice(
                    0,
                    this.COMMAND_HISTORY_LIMIT,
                )
            }

            return this.setUserSession(session)
        } catch (error) {
            errorLog({ message: "Error updating user activity:", error })
            return false
        }
    }

    /**
     * Get queue session
     */
    async getQueueSession(guildId: string): Promise<QueueSession | null> {
        try {
            const sessionKey = this.getQueueSessionKey(guildId)
            const sessionData = await redisClient.get(sessionKey)

            if (!sessionData) {
                return null
            }

            return JSON.parse(sessionData) as QueueSession
        } catch (error) {
            errorLog({
                message: "Error getting queue session from Redis:",
                error,
            })
            return null
        }
    }

    /**
     * Set queue session
     */
    async setQueueSession(session: QueueSession): Promise<boolean> {
        try {
            const sessionKey = this.getQueueSessionKey(session.guildId)

            // Update last updated timestamp
            session.lastUpdated = Date.now()

            const success = await redisClient.set(
                sessionKey,
                JSON.stringify(session),
                this.QUEUE_SESSION_TTL,
            )

            if (success) {
                debugLog({
                    message: `Updated queue session for ${session.guildId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({
                message: "Error setting queue session in Redis:",
                error,
            })
            return false
        }
    }

    /**
     * Update queue session with current state
     */
    async updateQueueSession(
        guildId: string,
        channelId: string,
        voiceChannelId: string,
        isPlaying: boolean,
        volume: number,
        repeatMode: number,
        queuePosition: number = 0,
        lastTrackId?: string,
    ): Promise<boolean> {
        try {
            const session: QueueSession = {
                guildId,
                channelId,
                voiceChannelId,
                lastTrackId,
                queuePosition,
                isPlaying,
                volume,
                repeatMode,
                lastUpdated: Date.now(),
            }

            return this.setQueueSession(session)
        } catch (error) {
            errorLog({ message: "Error updating queue session:", error })
            return false
        }
    }

    /**
     * Get active sessions for a guild
     */
    async getGuildActiveSessions(guildId: string): Promise<UserSession[]> {
        try {
            const pattern = `user_session:*:${guildId}`
            const keys = await redisClient.keys(pattern)

            const sessions: UserSession[] = []

            for (const key of keys) {
                const sessionData = await redisClient.get(key)
                if (sessionData) {
                    const session = JSON.parse(sessionData) as UserSession
                    // Only include sessions active in the last hour
                    if (Date.now() - session.lastActivity < 60 * 60 * 1000) {
                        sessions.push(session)
                    }
                }
            }

            return sessions
        } catch (error) {
            errorLog({ message: "Error getting guild active sessions:", error })
            return []
        }
    }

    /**
     * Clear user session
     */
    async clearUserSession(userId: string, guildId: string): Promise<boolean> {
        try {
            const sessionKey = this.getUserSessionKey(userId, guildId)
            const success = await redisClient.del(sessionKey)

            if (success) {
                debugLog({
                    message: `Cleared user session for ${userId} in ${guildId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: "Error clearing user session:", error })
            return false
        }
    }

    /**
     * Clear queue session
     */
    async clearQueueSession(guildId: string): Promise<boolean> {
        try {
            const sessionKey = this.getQueueSessionKey(guildId)
            const success = await redisClient.del(sessionKey)

            if (success) {
                debugLog({ message: `Cleared queue session for ${guildId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: "Error clearing queue session:", error })
            return false
        }
    }

    /**
     * Clear all sessions for a guild
     */
    async clearGuildSessions(guildId: string): Promise<boolean> {
        try {
            // Clear queue session
            await this.clearQueueSession(guildId)

            // Clear all user sessions for the guild
            const pattern = `user_session:*:${guildId}`
            const keys = await redisClient.keys(pattern)

            if (keys.length > 0) {
                await Promise.all(keys.map((key) => redisClient.del(key)))
            }

            debugLog({ message: `Cleared all sessions for guild ${guildId}` })
            return true
        } catch (error) {
            errorLog({ message: "Error clearing guild sessions:", error })
            return false
        }
    }
}

// Export singleton instance
export const sessionService = new SessionService()
