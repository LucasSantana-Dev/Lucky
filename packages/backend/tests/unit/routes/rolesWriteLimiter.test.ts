import { describe, test, expect, jest } from '@jest/globals'
import type { Express } from 'express'

const writeLimiter = jest.fn()

jest.mock('../../../src/middleware/rateLimit', () => ({
    writeLimiter,
    apiLimiter: jest.fn(),
}))

import { requireAuth } from '../../../src/middleware/auth'
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

    test('POST /reaction-roles limits after auth and before upload parsing', () => {
        const route = routes.find(
            (r) =>
                r.method === 'post' &&
                r.path === '/api/guilds/:guildId/reaction-roles',
        )
        const handlers = route?.handlers ?? []
        const authIdx = handlers.indexOf(requireAuth)
        const limiterIdx = handlers.indexOf(writeLimiter)
        const uploadIdx = handlers.findIndex(
            (h) => typeof h === 'function' && h.name === 'imageUploadHandler',
        )
        expect(authIdx).toBeGreaterThanOrEqual(0)
        expect(uploadIdx).toBeGreaterThan(limiterIdx)
        expect(limiterIdx).toBeGreaterThan(authIdx)
    })

    test('DELETE /reaction-roles/:messageId limits after auth', () => {
        const route = routes.find(
            (r) =>
                r.method === 'delete' &&
                r.path === '/api/guilds/:guildId/reaction-roles/:messageId',
        )
        const handlers = route?.handlers ?? []
        expect(route).toBeDefined()
        expect(handlers).toContain(writeLimiter)
        expect(handlers.indexOf(writeLimiter)).toBeGreaterThan(
            handlers.indexOf(requireAuth),
        )
    })

    test('every mutating roles route uses the write limiter', () => {
        const mutating = routes.filter((r) => r.method !== 'get')
        expect(mutating.length).toBeGreaterThan(0)
        const missing = mutating
            .filter((r) => !r.handlers.includes(writeLimiter))
            .map((r) => `${r.method} ${r.path}`)
        expect(missing).toEqual([])
    })
})
