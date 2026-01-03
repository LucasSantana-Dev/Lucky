import { redisClient } from '../../config/redis'
import { debugLog, errorLog } from '../../utils/general/log'
import type { UserSession, SessionConfig } from './types'

/**
 * User session manager
 */
export class UserSessionManager {
    constructor(private readonly config: SessionConfig) {}

    async createUserSession(session: UserSession): Promise<boolean> {
        try {
            const key = `user_session:${session.userId}:${session.guildId}`
            const sessionData = JSON.stringify(session)

            const success = await redisClient.setex(
                key,
                this.config.userSessionTtl,
                sessionData,
            )

            if (success) {
                debugLog({
                    message: `Created user session for ${session.userId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to create user session:', error })
            return false
        }
    }

    async getUserSession(
        userId: string,
        guildId: string,
    ): Promise<UserSession | null> {
        try {
            const key = `user_session:${userId}:${guildId}`
            const sessionData = await redisClient.get(key)

            if (!sessionData) {
                return null
            }

            return JSON.parse(sessionData) as UserSession
        } catch (error) {
            errorLog({ message: 'Failed to get user session:', error })
            return null
        }
    }

    async updateUserSession(session: UserSession): Promise<boolean> {
        try {
            const key = `user_session:${session.userId}:${session.guildId}`
            const sessionData = JSON.stringify(session)

            const success = await redisClient.setex(
                key,
                this.config.userSessionTtl,
                sessionData,
            )

            if (success) {
                debugLog({
                    message: `Updated user session for ${session.userId}`,
                })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to update user session:', error })
            return false
        }
    }

    async deleteUserSession(userId: string, guildId: string): Promise<boolean> {
        try {
            const key = `user_session:${userId}:${guildId}`
            const success = await redisClient.del(key)

            if (success) {
                debugLog({ message: `Deleted user session for ${userId}` })
            }

            return success
        } catch (error) {
            errorLog({ message: 'Failed to delete user session:', error })
            return false
        }
    }

    async addCommandToHistory(
        userId: string,
        guildId: string,
        command: string,
    ): Promise<boolean> {
        try {
            const session = await this.getUserSession(userId, guildId)
            if (!session) {
                return false
            }

            session.commandHistory.push(command)
            if (session.commandHistory.length > this.config.maxCommandHistory) {
                session.commandHistory = session.commandHistory.slice(
                    -this.config.maxCommandHistory,
                )
            }

            session.lastActivity = Date.now()

            return await this.updateUserSession(session)
        } catch (error) {
            errorLog({ message: 'Failed to add command to history:', error })
            return false
        }
    }

    async updateUserPreferences(
        userId: string,
        guildId: string,
        preferences: Record<string, unknown>,
    ): Promise<boolean> {
        try {
            const session = await this.getUserSession(userId, guildId)
            if (!session) {
                return false
            }

            session.preferences = { ...session.preferences, ...preferences }
            session.lastActivity = Date.now()

            return await this.updateUserSession(session)
        } catch (error) {
            errorLog({ message: 'Failed to update user preferences:', error })
            return false
        }
    }
}
