import session from 'express-session'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import type { Express } from 'express'

export function setupSessionMiddleware(app: Express): void {
    const sessionSecret = process.env.WEBAPP_SESSION_SECRET

    if (!sessionSecret) {
        errorLog({
            message: 'WEBAPP_SESSION_SECRET not configured. Session management will not work properly.',
        })
    }

    const isProduction = process.env.NODE_ENV === 'production'

    debugLog({
        message: 'Using memory store for sessions. Redis session store will be implemented in a future update.',
    })

    app.use(
        session({
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
