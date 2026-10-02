import { describe, test, expect, jest } from '@jest/globals'
import type { Express } from 'express'

const writeLimiter = jest.fn()

jest.mock('../../../src/middleware/rateLimit', () => ({
    writeLimiter,
    apiLimiter: jest.fn(),
}))

import { setupRolesRoutes } from '../../../src/routes/roles'

type Registered = { method: string; path: string; handlers: unknown[] }

function collectRoutes(): Registered[] {
    const routes: Registered[] = []
    const record =
        (method: string) =>
        (path: string, ...handlers: unknown[]) => {
            routes.push({ method, path, handlers })
        }
    const app = {
        get: record('get'),
        post: record('post'),
        put: record('put'),
        patch: record('patch'),
        delete: record('delete'),
    } as unknown as Express
    setupRolesRoutes(app)
    return routes
}

describe('roles routes write rate limiting', () => {
    const routes = collectRoutes()

    test('POST /reaction-roles uses the write limiter', () => {
        const route = routes.find(
            (r) =>
                r.method === 'post' &&
                r.path === '/api/guilds/:guildId/reaction-roles',
        )
        expect(route).toBeDefined()
        expect(route?.handlers).toContain(writeLimiter)
    })
})
