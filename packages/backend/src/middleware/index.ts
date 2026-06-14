import express, { type Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import path from 'path'
import { setupSessionMiddleware } from './session'
import { requestId } from './requestId'
import { requestLogger } from './requestLogger'
import { metricsMiddleware } from './metrics'
import { getFrontendOrigins } from '../utils/frontendOrigin'

export function setupMiddleware(app: Express): void {
    const configuredOrigins = getFrontendOrigins()
    const isProduction = process.env.NODE_ENV === 'production'

    if (isProduction) {
        app.set('trust proxy', 1)
    }

    app.use(
        helmet({
            // Same Report-Only CSP as the serving edges (vercel.json /
            // nginx) — the backend serves the SPA index.html fallback in
            // production (server.ts), so it must carry the same policy.
            // Flips to enforce with PR 2 of #1283 after the measurement
            // window. See decisions/2026-06-11-security-headers-placement.md
            contentSecurityPolicy: {
                useDefaults: false,
                reportOnly: true,
                directives: {
                    'default-src': ["'self'"],
                    'script-src': ["'self'"],
                    'style-src': [
                        "'self'",
                        "'unsafe-inline'",
                        'https://fonts.googleapis.com',
                    ],
                    'font-src': [
                        "'self'",
                        'data:',
                        'https://fonts.gstatic.com',
                    ],
                    'img-src': [
                        "'self'",
                        'data:',
                        'blob:',
                        'https://cdn.discordapp.com',
                        'https://cdn.discord.com',
                    ],
                    'connect-src': [
                        "'self'",
                        'https://lucky-api.lucassantana.tech',
                        'https://api.luk-homeserver.com.br',
                        'https://*.sentry.io',
                    ],
                    'worker-src': ["'self'", 'blob:'],
                    'frame-ancestors': ["'none'"],
                    'base-uri': ["'self'"],
                    'form-action': ["'self'"],
                    'object-src': ["'none'"],
                },
            },
            // TLS terminates at the Cloudflare Tunnel, which owns HSTS;
            // this app only ever sees plain HTTP behind the proxy
            hsts: false,
            frameguard: { action: 'deny' },
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            // API images (e.g. support-report attachments) are embedded by
            // the web origin; same-origin CORP would block those loads
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    )

    const isAllowedOrigin = (origin: string): boolean => {
        if (configuredOrigins.includes(origin)) {
            return true
        }

        try {
            const parsed = new URL(origin)
            const host = parsed.hostname.toLowerCase()

            // Localhost is only trusted off-production (local dev); never allow
            // it as a credentialed cross-origin in prod.
            if (
                !isProduction &&
                (host === 'localhost' || host === '127.0.0.1')
            ) {
                return true
            }

            // Only first-party production hosts. Multi-tenant dev platforms
            // (replit.dev / repl.co / replit.app) are NOT trusted with
            // credentials — see ADR 2026-06-05-csrf-posture.
            return (
                host === 'lucassantana.tech' ||
                host.endsWith('.lucassantana.tech') ||
                host === 'luk-homeserver.com.br' ||
                host.endsWith('.luk-homeserver.com.br')
            )
        } catch {
            return false
        }
    }

    app.use(
        cors({
            origin: (origin, callback) => {
                if (!origin || isAllowedOrigin(origin)) {
                    callback(null, true)
                    return
                }

                callback(new Error('Not allowed by CORS'))
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )

    app.use(requestId)
    app.use(requestLogger)
    app.use(metricsMiddleware)
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use(cookieParser())
    setupSessionMiddleware(app)

    if (isProduction) {
        const monorepoPublicPath = path.join(
            process.cwd(),
            'packages',
            'backend',
            'public',
        )
        const localPublicPath = path.join(process.cwd(), 'public')
        const staticPath = existsSync(monorepoPublicPath)
            ? monorepoPublicPath
            : localPublicPath

        app.use(express.static(staticPath))
    }
}
