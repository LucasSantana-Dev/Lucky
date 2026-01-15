import session from 'express-session'
import { debugLog, errorLog } from '../../utils/general/log'
import type { Express } from 'express'

export function setupSessionMiddleware(app: Express): void {
    const sessionSecret = process.env.WEBAPP_SESSION_SECRET

    if (!sessionSecret) {
        errorLog({
            message:
                'WEBAPP_SESSION_SECRET not configured. Session management will not work properly.',
        })
    }

    const isProduction = process.env.NODE_ENV === 'production'
    const frontendUrl =
        process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'
    const frontendOrigin = new URL(frontendUrl).origin

    app.use(
        session({
            secret: sessionSecret ?? 'default-secret-change-in-production',
            resave: false,
            saveUninitialized: false,
            name: 'sessionId',
            cookie: {
                secure: isProduction,
                httpOnly: true,
                maxAge: 7 * 24 * 60 * 60 * 1000,
                sameSite: 'lax',
            },
        }),
    )

    debugLog({
        message: 'Session middleware configured',
        data: {
            secure: isProduction,
            sameSite: 'lax',
            frontendOrigin,
        },
    })
}
