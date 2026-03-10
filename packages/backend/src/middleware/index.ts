import express, { type Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { setupSessionMiddleware } from './session'
import { requestLogger } from './requestLogger'
import { getFrontendOrigins } from '../utils/frontendOrigin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function setupMiddleware(app: Express): void {
    const configuredOrigins = getFrontendOrigins()

    const isAllowedOrigin = (origin: string): boolean => {
        if (configuredOrigins.includes(origin)) {
            return true
        }

        try {
            const parsed = new URL(origin)
            const host = parsed.hostname.toLowerCase()

            if (host === 'localhost' || host === '127.0.0.1') {
                return true
            }

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

    app.use(requestLogger)
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use(cookieParser())
    setupSessionMiddleware(app)

    // Only serve static files in production mode
    const isProduction = process.env.NODE_ENV === 'production'
    if (isProduction) {
        app.use(express.static(path.join(__dirname, '../public')))
    }
}
