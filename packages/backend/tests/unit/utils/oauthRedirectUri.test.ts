import type { Request } from 'express'
import { beforeEach, afterEach, describe, expect, test } from '@jest/globals'
import { getOAuthRedirectUri } from '../../../src/utils/oauthRedirectUri'

function createRequest(
    headers: Record<string, string> = {},
    protocol = 'http',
    host = 'localhost:3000',
): Request {
    return {
        headers,
        protocol,
        get: (name: string) =>
            name.toLowerCase() === 'host' ? host : undefined,
    } as unknown as Request
}

describe('getOAuthRedirectUri', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalRedirectUri = process.env.WEBAPP_REDIRECT_URI
    const originalBackendUrl = process.env.WEBAPP_BACKEND_URL
    const originalFrontendUrl = process.env.WEBAPP_FRONTEND_URL

    beforeEach(() => {
        process.env.NODE_ENV = 'test'
        process.env.WEBAPP_REDIRECT_URI =
            'http://localhost:3000/api/auth/callback'
        delete process.env.WEBAPP_BACKEND_URL
        process.env.WEBAPP_FRONTEND_URL = 'http://localhost:5173'
    })

    afterEach(() => {
        if (originalNodeEnv) {
            process.env.NODE_ENV = originalNodeEnv
        } else {
            delete process.env.NODE_ENV
        }

        if (originalRedirectUri) {
            process.env.WEBAPP_REDIRECT_URI = originalRedirectUri
        } else {
            delete process.env.WEBAPP_REDIRECT_URI
        }

        if (originalBackendUrl) {
            process.env.WEBAPP_BACKEND_URL = originalBackendUrl
        } else {
            delete process.env.WEBAPP_BACKEND_URL
        }

        if (originalFrontendUrl) {
            process.env.WEBAPP_FRONTEND_URL = originalFrontendUrl
        } else {
            delete process.env.WEBAPP_FRONTEND_URL
        }
    })

    test('should prefer session redirect uri when available', () => {
        const uri = getOAuthRedirectUri(
            createRequest(),
            'https://api.example.com/api/auth/callback',
        )

        expect(uri).toBe('https://api.example.com/api/auth/callback')
    })

    test('should normalize legacy /auth/callback path', () => {
        const uri = getOAuthRedirectUri(
            createRequest(),
            'https://api.example.com/auth/callback',
        )

        expect(uri).toBe('https://api.example.com/api/auth/callback')
    })

    test('should derive callback from forwarded host in production when env is unset', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.WEBAPP_REDIRECT_URI

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'lucky.lucassantana.tech',
            }),
        )

        expect(uri).toBe('https://lucky.lucassantana.tech/api/auth/callback')
    })

    test('should normalize legacy /auth/callback from env', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky.lucassantana.tech/auth/callback'

        const uri = getOAuthRedirectUri(createRequest())

        expect(uri).toBe('https://lucky.lucassantana.tech/api/auth/callback')
    })

    test('should keep configured callback when WEBAPP_BACKEND_URL is set', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky.lucassantana.tech/api/auth/callback'
        process.env.WEBAPP_BACKEND_URL = 'https://lucky-api.lucassantana.tech'

        const uri = getOAuthRedirectUri(createRequest())

        expect(uri).toBe('https://lucky.lucassantana.tech/api/auth/callback')
    })

    test('should not override configured callback with forwarded host in production', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky.lucassantana.tech/api/auth/callback'
        process.env.WEBAPP_FRONTEND_URL = 'https://lucky.lucassantana.tech'

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'lucky-api.lucassantana.tech',
            }),
        )

        expect(uri).toBe('https://lucky.lucassantana.tech/api/auth/callback')
    })

    test('should keep configured callback when frontend origins do not match redirect origin', () => {
        process.env.NODE_ENV = 'production'
        process.env.WEBAPP_REDIRECT_URI =
            'https://lucky-api.lucassantana.tech/api/auth/callback'
        process.env.WEBAPP_FRONTEND_URL = 'https://lucky.lucassantana.tech'

        const uri = getOAuthRedirectUri(createRequest())

        expect(uri).toBe('https://lucky-api.lucassantana.tech/api/auth/callback')
    })

    test('should use forwarded host in non-production when env is unset', () => {
        delete process.env.WEBAPP_REDIRECT_URI

        const uri = getOAuthRedirectUri(
            createRequest({
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'dashboard.example.com',
            }),
        )

        expect(uri).toBe('https://dashboard.example.com/api/auth/callback')
    })
})
