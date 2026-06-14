import session from 'express-session'
import { getPrismaClient, debugLog, errorLog } from '@lucky/shared/utils'

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PRUNE_INTERVAL_MS = 60 * 60 * 1000
const PRISMA_RECORD_NOT_FOUND = 'P2025'

type PrismaClientLike = ReturnType<typeof getPrismaClient>

function isRecordNotFound(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === PRISMA_RECORD_NOT_FOUND
    )
}

/**
 * express-session store backed by Postgres via the app's Prisma client.
 *
 * Replaces the previous Redis (connect-redis) store as part of the Redis
 * scope-reduction arc (ADR 2026-05-31-redis-scope-reduction, #1111). It reuses
 * the existing Prisma client rather than opening a second connection pool, so
 * it adds no infrastructure dependency. Expired rows are removed lazily on read
 * and by an unref'd periodic sweep.
 */
export class PrismaSessionStore extends session.Store {
    private readonly pruneTimer: ReturnType<typeof setInterval>

    constructor(
        private readonly db: PrismaClientLike = getPrismaClient(),
        private readonly ttlMs: number = DEFAULT_TTL_MS,
    ) {
        super()
        this.pruneTimer = setInterval(() => {
            void this.prune()
        }, PRUNE_INTERVAL_MS)
        // Don't keep the event loop alive just for session pruning.
        this.pruneTimer.unref?.()
    }

    private expiresAtFor(sessionData: session.SessionData): Date {
        const cookieExpires = sessionData.cookie?.expires
        return cookieExpires
            ? new Date(cookieExpires)
            : new Date(Date.now() + this.ttlMs)
    }

    get(
        sid: string,
        callback: (
            error?: unknown,
            sessionData?: session.SessionData | null,
        ) => void,
    ): void {
        this.db.session
            .findUnique({ where: { sid } })
            .then((row) => {
                if (!row) {
                    callback(null, null)
                    return
                }
                if (row.expiresAt.getTime() <= Date.now()) {
                    // Lazily evict the expired row; absence is reported as no session.
                    void this.db.session
                        .delete({ where: { sid } })
                        .catch(() => undefined)
                    callback(null, null)
                    return
                }
                try {
                    callback(null, JSON.parse(row.data) as session.SessionData)
                } catch {
                    // Corrupt payload: treat as no session rather than wedging auth.
                    callback(null, null)
                }
            })
            .catch((error) => callback(error))
    }

    set(
        sid: string,
        sessionData: session.SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        const data = JSON.stringify(sessionData)
        const expiresAt = this.expiresAtFor(sessionData)
        this.db.session
            .upsert({
                where: { sid },
                create: { sid, data, expiresAt },
                update: { data, expiresAt },
            })
            .then(() => callback())
            .catch((error) => callback(error))
    }

    destroy(sid: string, callback: (error?: unknown) => void = () => {}): void {
        this.db.session
            .delete({ where: { sid } })
            .then(() => callback())
            .catch((error) =>
                isRecordNotFound(error) ? callback() : callback(error),
            )
    }

    touch(
        sid: string,
        sessionData: session.SessionData,
        callback: (error?: unknown) => void = () => {},
    ): void {
        const expiresAt = this.expiresAtFor(sessionData)
        this.db.session
            .update({ where: { sid }, data: { expiresAt } })
            .then(() => callback())
            // A missing row (touch before set / after destroy) is a benign
            // no-op, but real DB errors must propagate so ResilientSessionStore
            // can fail over instead of silently masking an outage.
            .catch((error) =>
                isRecordNotFound(error) ? callback() : callback(error),
            )
    }

    async prune(): Promise<void> {
        try {
            const { count } = await this.db.session.deleteMany({
                where: { expiresAt: { lte: new Date() } },
            })
            if (count > 0) {
                debugLog({
                    message: `PrismaSessionStore: pruned ${count} expired sessions`,
                })
            }
        } catch (error) {
            errorLog({
                message: 'PrismaSessionStore: failed to prune expired sessions',
                error,
            })
        }
    }

    stopPruning(): void {
        clearInterval(this.pruneTimer)
    }
}
