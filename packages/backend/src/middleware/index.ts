import express, { type Express } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { setupSessionMiddleware } from './session'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function setupMiddleware(app: Express): void {
    const frontendUrl =
        process.env.WEBAPP_FRONTEND_URL ?? 'http://localhost:5173'

    app.use(
        cors({
            origin: frontendUrl,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    )

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use(cookieParser())
    setupSessionMiddleware(app)
    app.use(express.static(path.join(__dirname, '../public')))
}
