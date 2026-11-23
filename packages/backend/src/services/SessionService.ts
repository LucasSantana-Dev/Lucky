import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { DiscordUser } from './DiscordOAuthService'
import {
    decryptToken,
    encryptToken,
    loadSessionTokenKey,
} from './sessionTokenCipher'

export interface SessionData {
    userId: string
    accessToken: string
    refreshToken: string
    user: DiscordUser
    expiresAt: number
}

const SESSION_FILE = join(process.cwd(), '.data', 'sessions.json')

export interface SessionServiceOptions {
    sessionFile?: string
}

async function writeFileAtomically(file: string, data: string): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    try {
        await writeFile(tmp, data, { encoding: 'utf-8', mode: 0o600 })
        await rename(tmp, file)
    } catch (error) {
        await rm(tmp, { force: true })
        throw error
    }
}

export class SessionService {
    private readonly sessionPrefix = 'webapp:session:'
    private readonly sessionTtl = 7 * 24 * 60 * 60
    private readonly sessionFile: string
    private readonly tokenKey: Buffer | null
    private readonly memoryStore: Map<string, string>
    private writeQueue: Promise<void> = Promise.resolve()

    constructor(options: SessionServiceOptions = {}) {
        this.sessionFile = options.sessionFile ?? SESSION_FILE
        this.tokenKey = loadSessionTokenKey()
        this.memoryStore = this.loadFromFile()
    }

    private serialize(sessionData: SessionData): string {
        const key = this.tokenKey
        if (!key) {
            return JSON.stringify(sessionData)
        }
        return JSON.stringify({
            ...sessionData,
            accessToken: encryptToken(sessionData.accessToken, key),
            refreshToken: encryptToken(sessionData.refreshToken, key),
        })
    }

    private deserialize(raw: string): SessionData {
        const stored = JSON.parse(raw) as SessionData
        return {
            ...stored,
            accessToken: decryptToken(stored.accessToken, this.tokenKey),
            refreshToken: decryptToken(stored.refreshToken, this.tokenKey),
        }
    }

    private getSessionKey(sessionId: string): string {
        return `${this.sessionPrefix}${sessionId}`
    }

    private useRedis(): boolean {
        return redisClient.isHealthy()
    }

    private loadFromFile(): Map<string, string> {
        let entries: [string, string][]
        try {
            // One-time read at startup, before the server accepts requests.
            entries = JSON.parse(readFileSync(this.sessionFile, 'utf-8')) as [
                string,
                string,
            ][]
        } catch {
            return new Map()
        }

        // Re-seal legacy plaintext entries in memory so the next write never
        // puts them back on disk unencrypted. Unreadable entries are dropped.
        const store = new Map<string, string>()
        for (const [key, raw] of entries) {
            try {
                store.set(key, this.serialize(this.deserialize(raw)))
            } catch {
                debugLog({ message: 'Dropped unreadable session from disk' })
            }
        }
        debugLog({ message: `Loaded ${store.size} sessions from disk` })
        return store
    }

    /**
     * Writes a snapshot of the store without blocking the event loop. Writes
     * are serialized so the file always ends on the latest snapshot, and each
     * one goes to a temp file renamed over the target, so a crash mid-write
     * never leaves a truncated file. Failures are logged, not thrown.
     */
    private persistToFile(): Promise<void> {
        const snapshot = JSON.stringify(Array.from(this.memoryStore.entries()))
        this.writeQueue = this.writeQueue
            .then(() => writeFileAtomically(this.sessionFile, snapshot))
            .catch((error: unknown) => {
                errorLog({
                    message: 'Failed to persist sessions to disk',
                    error,
                })
            })
        return this.writeQueue
    }

    async getSession(sessionId: string): Promise<SessionData | null> {
        try {
            const key = this.getSessionKey(sessionId)
            const data = this.useRedis()
                ? await redisClient.get(key)
                : (this.memoryStore.get(key) ?? null)

            if (!data) {
                return null
            }

            const sessionData = this.deserialize(data)

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

    async setSession(
        sessionId: string,
        sessionData: SessionData,
    ): Promise<void> {
        try {
            const key = this.getSessionKey(sessionId)
            const data = this.serialize(sessionData)

            if (this.useRedis()) {
                await redisClient.setex(key, this.sessionTtl, data)
            } else {
                this.memoryStore.set(key, data)
                await this.persistToFile()
                debugLog({
                    message: 'Session persisted to disk (Redis unavailable)',
                })
            }

            debugLog({
                message: 'Session stored successfully',
                data: { sessionId },
            })
        } catch (error) {
            errorLog({ message: 'Error setting session:', error })
            throw error
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        try {
            const key = this.getSessionKey(sessionId)

            if (this.useRedis()) {
                await redisClient.del(key)
            } else {
                this.memoryStore.delete(key)
                await this.persistToFile()
            }

            debugLog({
                message: 'Session deleted successfully',
                data: { sessionId },
            })
        } catch (error) {
            errorLog({ message: 'Error deleting session:', error })
        }
    }

    async updateSession(
        sessionId: string,
        updates: Partial<SessionData>,
    ): Promise<void> {
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
