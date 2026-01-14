import type { Express } from 'express'
import { setupAuthRoutes } from './auth'
import { setupToggleRoutes } from './toggles'
import { setupGuildRoutes } from './guilds'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function setupRoutes(app: Express): void {
    setupAuthRoutes(app)
    setupToggleRoutes(app)
    setupGuildRoutes(app)

    const isProduction = process.env.NODE_ENV === 'production'

    if (!isProduction) {
        app.get('/', (_req, res) => {
            res.sendFile('index.html', {
                root: path.join(__dirname, '../public'),
            })
        })
    }
}
