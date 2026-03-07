import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import session from 'express-session'
import { debugLog, errorLog } from '@nexus/shared/utils'
import type { Express } from 'express'

function createFileStore(sessionPath: string): session.Store | undefined {
    try {
        mkdirSync(sessionPath, { recursive: true })
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const FileStoreFactory = require('session-file-store')
        const FileStore = FileStoreFactory(session)
        return new FileStore({
            path: sessionPath,
            ttl: 7 * 24 * 60 * 60,
            retries: 1,
            logFn: () => {},
        })
    } catch {
        return undefined
    }
}

export function setupSessionMiddleware(app: Express): void {
    const sessionSecret = process.env.WEBAPP_SESSION_SECRET

    if (!sessionSecret) {
        errorLog({
            message:
                'WEBAPP_SESSION_SECRET not configured. Session management will not work properly.',
        })
    }

    const isProduction = process.env.NODE_ENV === 'production'
    const sessionPath = join(process.cwd(), '.data', 'sessions')
    const store = createFileStore(sessionPath)

    debugLog({
        message: store
            ? `Using file-based session store at ${sessionPath}`
            : 'Using in-memory session store',
    })

    app.use(
        session({
            ...(store ? { store } : {}),
            secret: sessionSecret ?? 'default-secret-change-in-production',
            resave: false,
            saveUninitialized: true,
            name: 'sessionId',
            cookie: {
                secure: isProduction,
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000,
                sameSite: 'lax',
                path: '/',
            },
        }),
    )
}
