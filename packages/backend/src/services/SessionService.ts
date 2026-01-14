import { redisClient } from '@lukbot/shared/services'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import type { DiscordUser } from './DiscordOAuthService'

export interface SessionData {
    userId: string
    accessToken: string
    refreshToken: string
    user: DiscordUser
    expiresAt: number
}

class SessionService {
    private readonly sessionPrefix = 'webapp:session:'
    private readonly sessionTtl = 7 * 24 * 60 * 60

    private getSessionKey(sessionId: string): string {
        return `${this.sessionPrefix}${sessionId}`
    }

    async getSession(sessionId: string): Promise<SessionData | null> {
        try {
            if (!redisClient.isHealthy()) {
                debugLog({ message: 'Redis client not available, session retrieval failed' })
                return null
            }

            const key = this.getSessionKey(sessionId)
            const data = await redisClient.get(key)

            if (!data) {
                return null
            }

            const sessionData = JSON.parse(data) as SessionData

            if (sessionData.expiresAt < Date.now()) {
                await this.deleteSession(sessionId)
                return null
            }

            return sessionData
        } catch (error) {
            errorLog({ message: 'Error getting session:', error })
            return null
        }
    }

    async setSession(sessionId: string, sessionData: SessionData): Promise<void> {
        try {
            if (!redisClient.isHealthy()) {
                debugLog({ message: 'Redis client not available, session storage failed' })
                return
            }

            const key = this.getSessionKey(sessionId)
            const data = JSON.stringify(sessionData)

            await redisClient.setex(key, this.sessionTtl, data)
            debugLog({ message: 'Session stored successfully', data: { sessionId } })
        } catch (error) {
            errorLog({ message: 'Error setting session:', error })
            throw error
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        try {
            if (!redisClient.isHealthy()) {
                debugLog({ message: 'Redis client not available, session deletion failed' })
                return
            }

            const key = this.getSessionKey(sessionId)
            await redisClient.del(key)
            debugLog({ message: 'Session deleted successfully', data: { sessionId } })
        } catch (error) {
            errorLog({ message: 'Error deleting session:', error })
        }
    }

    async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
        try {
            const existingSession = await this.getSession(sessionId)
            if (!existingSession) {
                throw new Error('Session not found')
            }

            const updatedSession: SessionData = {
                ...existingSession,
                ...updates,
            }

            await this.setSession(sessionId, updatedSession)
        } catch (error) {
            errorLog({ message: 'Error updating session:', error })
            throw error
        }
    }
}

export const sessionService = new SessionService()
