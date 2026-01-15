import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { infoLog, errorLog } from '@lukbot/shared/utils'
import { setupRoutes } from './routes'
import { setupMiddleware } from './middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WEBAPP_PORT = parseInt(process.env.WEBAPP_PORT ?? '3001')
const WEBAPP_HOST = process.env.WEBAPP_HOST ?? '127.0.0.1'
const isProduction = process.env.NODE_ENV === 'production'

export function startWebApp(): void {
    const app = express()

    setupMiddleware(app)
    setupRoutes(app)

    if (isProduction) {
        const frontendDistPath = path.join(__dirname, 'frontend', 'dist')
        app.use(express.static(frontendDistPath))
        app.get('*', (_req, res) => {
            res.sendFile(path.join(frontendDistPath, 'index.html'))
        })
    }

    const server = app.listen(WEBAPP_PORT, WEBAPP_HOST, () => {
        infoLog({
            message: `Web application started on ${WEBAPP_HOST}:${WEBAPP_PORT}`,
        })
    })

    server.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE') {
            errorLog({
                message: `Port ${WEBAPP_PORT} is already in use. Please stop the conflicting service or set WEBAPP_PORT to a different port.`,
                error: { code: error.code, port: WEBAPP_PORT },
            })
            process.exit(1)
        } else {
            errorLog({ message: 'Web application error:', error })
        }
    })
}
