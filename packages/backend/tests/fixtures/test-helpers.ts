import type { Request, Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../src/middleware/auth'
import type { SessionData } from '../../src/services/SessionService'
import { MOCK_SESSION_DATA, MOCK_SESSION_ID } from './mock-data'

export function createMockRequest(
    overrides: Partial<Request> = {},
): AuthenticatedRequest {
    const req = {
        sessionID: MOCK_SESSION_ID,
        session: {
            destroy: jest.fn((callback: (err?: Error) => void) => callback()),
        },
        query: {},
        params: {},
        body: {},
        headers: {},
        ...overrides,
    } as unknown as AuthenticatedRequest

    return req
}

export function createMockResponse(): Response {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        redirect: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        sendFile: jest.fn().mockReturnThis(),
        cookie: jest.fn().mockReturnThis(),
        clearCookie: jest.fn().mockReturnThis(),
    } as unknown as Response

    return res
}

export function createMockNext(): NextFunction {
    return jest.fn()
}

export function createMockSession(sessionData?: SessionData): SessionData {
    return sessionData || MOCK_SESSION_DATA
}

export async function createTestApp() {
    const express = (await import('express')).default
    const app = express()

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    return app
}
