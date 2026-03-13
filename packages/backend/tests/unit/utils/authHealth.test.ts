import { describe, expect, test } from '@jest/globals'
import {
    buildAuthConfigHealth,
    buildAuthorizeUrlPreview,
} from '../../../src/utils/authHealth'

describe('authHealth utils', () => {
    describe('buildAuthorizeUrlPreview', () => {
        test('builds encoded Discord authorize URL', () => {
            const preview = buildAuthorizeUrlPreview(
                '962198089161134131',
                'https://lucky.lucassantana.tech/api/auth/callback',
            )

            expect(preview).toBe(
                'https://discord.com/api/oauth2/authorize?client_id=962198089161134131&redirect_uri=https%3A%2F%2Flucky.lucassantana.tech%2Fapi%2Fauth%2Fcallback&response_type=code&scope=identify%20guilds',
            )
        })

        test('returns empty preview when client id is missing', () => {
            expect(
                buildAuthorizeUrlPreview(
                    '',
                    'https://lucky.lucassantana.tech/api/auth/callback',
                ),
            ).toBe('')
        })
    })

    describe('buildAuthConfigHealth', () => {
        test('returns ok when redirect contract matches frontend origins', () => {
            const response = buildAuthConfigHealth({
                clientId: '962198089161134131',
                redirectUri:
                    'https://lucky.lucassantana.tech/api/auth/callback',
                frontendOrigins: [
                    'https://lucky.lucassantana.tech',
                ],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('ok')
            expect(response.auth.clientId).toBe('962198089161134131')
            expect(response.auth.authorizeUrlPreview).toContain(
                'client_id=962198089161134131',
            )
            expect(response.warnings).toEqual([])
        })

        test('returns degraded when redirect uri origin is outside frontend origins', () => {
            const response = buildAuthConfigHealth({
                clientId: '962198089161134131',
                redirectUri: 'https://app.otherdomain.com/api/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL',
            )
        })

        test('returns ok when redirect uri origin matches WEBAPP_BACKEND_URL and frontend origins are unset', () => {
            const response = buildAuthConfigHealth({
                clientId: '962198089161134131',
                redirectUri:
                    'https://lucky-api.lucassantana.tech/api/auth/callback',
                frontendOrigins: [],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('ok')
            expect(response.warnings).toEqual([])
        })

        test('returns degraded when callback path is not the API callback path', () => {
            const response = buildAuthConfigHealth({
                clientId: '962198089161134131',
                redirectUri: 'https://lucky.lucassantana.tech/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth callback path should be /api/auth/callback',
            )
        })

        test('returns degraded when client id differs from expected production app id', () => {
            const response = buildAuthConfigHealth({
                clientId: '111111111111111111',
                expectedClientId: '962198089161134131',
                redirectUri:
                    'https://lucky.lucassantana.tech/api/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'CLIENT_ID does not match expected production app id (962198089161134131)',
            )
        })
    })
})
