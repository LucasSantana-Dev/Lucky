import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { setupRoutes } from './routes'
import { setupMiddleware } from './middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WEBAPP_PORT = parseInt(process.env.WEBAPP_PORT ?? '3000')
const WEBAPP_HOST = process.env.WEBAPP_HOST ?? '0.0.0.0'
const isProduction = process.env.NODE_ENV === 'production'

export function startWebApp(): void {
    const app = express()

    if (isProduction) {
        app.set('trust proxy', 1)
    }

    setupMiddleware(app)
    setupRoutes(app)

    if (isProduction) {
        const frontendDistPath = path.join(__dirname, 'frontend', 'dist')
        app.use(express.static(frontendDistPath))
        app.get('/{*path}', (req, res, next) => {
            if (/^\/api(?:\/|$)/.test(req.path)) {
                next()
                return
            }
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
            const fallbackPort = WEBAPP_PORT + 1
            infoLog({
                message: `Port ${WEBAPP_PORT} in use, trying ${fallbackPort}...`,
            })
            app.listen(fallbackPort, WEBAPP_HOST, () => {
                infoLog({
                    message: `Web application started on ${WEBAPP_HOST}:${fallbackPort}`,
                })
            })
            return
        }
        errorLog({ message: 'Web application error:', error })
        process.exit(1)
    })
}
