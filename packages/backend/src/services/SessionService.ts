import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { redisClient } from '@lucky/shared/services'
import { debugLog, errorLog, warnLog } from '@lucky/shared/utils'
import type { DiscordUser } from './DiscordOAuthService'
import {
    decryptToken,
    encryptToken,
    isSealedToken,
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
        const handle = await open(tmp, 'w', 0o600)
        try {
            await handle.writeFile(data, 'utf-8')
            // Flush to disk before the rename so a power loss cannot leave an
            // empty file under the final name.
            await handle.sync()
        } finally {
            await handle.close()
        }
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
        const { store, needsWrite } = this.loadFromFile()
        this.memoryStore = store
        if (needsWrite) {
            void this.persistToFile()
        }
    }

    private static isEntry(value: unknown): value is [string, string] {
        return (
            Array.isArray(value) &&
            value.length === 2 &&
            typeof value[0] === 'string' &&
            typeof value[1] === 'string'
        )
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

    private hasLegacyTokens(raw: string): boolean {
        if (!this.tokenKey) {
            return false
        }
        const stored = JSON.parse(raw) as SessionData
        return !(
            isSealedToken(stored.accessToken) &&
            isSealedToken(stored.refreshToken)
        )
    }

    private loadFromFile(): {
        store: Map<string, string>
        needsWrite: boolean
    } {
        const store = new Map<string, string>()
        let entries: unknown
        try {
            // One-time read at startup, before the server accepts requests.
            entries = JSON.parse(readFileSync(this.sessionFile, 'utf-8'))
        } catch {
            return { store, needsWrite: false }
        }
        if (!Array.isArray(entries)) {
            warnLog({ message: 'Ignored a sessions file that is not a list' })
            return { store, needsWrite: false }
        }

        // Legacy plaintext entries are re-sealed, and the constructor writes
        // the file once so they leave the disk. Entries that are malformed or
        // fail decryption (wrong or rotated key, tampering) are dropped.
        let dropped = 0
        let resealed = 0
        for (const entry of entries) {
            try {
                if (!SessionService.isEntry(entry)) {
                    throw new Error('Malformed session entry')
                }
                const [key, raw] = entry
                const session = this.deserialize(raw)
                if (this.hasLegacyTokens(raw)) {
                    store.set(key, this.serialize(session))
                    resealed++
                } else {
                    store.set(key, raw)
                }
            } catch {
                dropped++
            }
        }
        if (dropped > 0) {
            warnLog({
                message: `Dropped ${dropped} unreadable sessions from disk (malformed, tampered, or sealed with another SESSION_TOKEN_KEY)`,
            })
        }
        debugLog({ message: `Loaded ${store.size} sessions from disk` })
        return { store, needsWrite: dropped > 0 || resealed > 0 }
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
