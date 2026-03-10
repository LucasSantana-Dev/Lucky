import { describe, test, expect } from '@jest/globals'
import express from 'express'
import { setupMiddleware } from '../../../src/middleware'

describe('Middleware setup', () => {
    test('should enable trust proxy in production', () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        const app = express()

        setupMiddleware(app)

        expect(app.get('trust proxy')).toBe(1)
        process.env.NODE_ENV = originalNodeEnv
    })

    test('should not force trust proxy outside production', () => {
        const originalNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'test'
        const app = express()

        setupMiddleware(app)

        expect(app.get('trust proxy')).not.toBe(1)
        process.env.NODE_ENV = originalNodeEnv
    })
})
