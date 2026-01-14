import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { infoLog, errorLog } from '../utils/general/log'
import { setupRoutes } from './routes'
import { setupMiddleware } from './middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WEBAPP_PORT = parseInt(process.env.WEBAPP_PORT ?? '3000')
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

    const server = app.listen(WEBAPP_PORT, () => {
        infoLog({ message: `Web application started on port ${WEBAPP_PORT}` })
    })

    server.on('error', (error) => {
        errorLog({ message: 'Web application error:', error })
    })
}
