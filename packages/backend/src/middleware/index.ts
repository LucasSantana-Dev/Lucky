import express, { type Express } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { setupSessionMiddleware } from './session'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function setupMiddleware(app: Express): void {
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    setupSessionMiddleware(app)
    app.use(express.static(path.join(__dirname, '../public')))
}
