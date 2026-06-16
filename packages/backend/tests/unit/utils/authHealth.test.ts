import { describe, expect, test } from '@jest/globals'
import {
    buildAuthConfigHealth,
    buildAuthorizeUrlPreview,
} from '../../../src/utils/authHealth'

describe('authHealth utils', () => {
    describe('buildAuthorizeUrlPreview', () => {
        test('builds encoded Discord authorize URL', () => {
            const preview = buildAuthorizeUrlPreview(
                'test-client-id',
                'https://lucky.lucassantana.tech/api/auth/callback',
            )

            expect(preview).toBe(
                'https://discord.com/api/oauth2/authorize?client_id=test-client-id&redirect_uri=https%3A%2F%2Flucky.lucassantana.tech%2Fapi%2Fauth%2Fcallback&response_type=code&scope=identify%20guilds',
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
        // A fully-valid input (status 'ok', no warnings). Each test overrides
        // only the fields it exercises so a single warning is isolated.
        const base = (
            over: Partial<Parameters<typeof buildAuthConfigHealth>[0]> = {},
        ): Parameters<typeof buildAuthConfigHealth>[0] => ({
            clientId: 'test-client-id',
            redirectUri: 'https://lucky.lucassantana.tech/api/auth/callback',
            frontendOrigins: ['https://lucky.lucassantana.tech'],
            backendOrigins: ['https://lucky-api.lucassantana.tech'],
            sessionSecretConfigured: true,
            redisHealthy: true,
            ...over,
        })

        test('returns ok when redirect contract matches frontend origins', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri:
                    'https://lucky.lucassantana.tech/api/auth/callback',
                frontendOrigins: [
                    'https://lucky.lucassantana.tech',
                    'https://lukbot.vercel.app',
                ],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('ok')
            expect(response.auth.clientId).toBe('test-client-id')
            // A configured client id reports clientIdConfigured=true — pins the
            // `clientId.length > 0` flag against an always-false mutant.
            expect(response.auth.clientIdConfigured).toBe(true)
            expect(response.auth.authorizeUrlPreview).toContain(
                'client_id=test-client-id',
            )
            expect(response.warnings).toEqual([])
        })

        test('returns degraded when redirect uri origin is outside frontend origins', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri: 'https://app.otherdomain.com/api/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('returns ok when redirect uri origin matches WEBAPP_BACKEND_URL', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri:
                    'https://lucky-api.lucassantana.tech/api/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('ok')
            expect(response.warnings).toEqual([])
        })

        test('returns ok when redirect uri origin matches request origin fallback', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri:
                    'https://lucky-api.lucassantana.tech/api/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: [],
                requestOrigin: 'https://lucky-api.lucassantana.tech',
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('ok')
            expect(response.warnings).toEqual([])
        })

        test('returns degraded when callback path is not the API callback path', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
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

        test('returns degraded when redirect uri is invalid', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri: 'not-a-valid-uri',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain('OAuth redirect URI is invalid')
        })

        test('returns degraded when no frontend, backend, or request origins are configured', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri:
                    'https://lucky.lucassantana.tech/api/auth/callback',
                frontendOrigins: [],
                backendOrigins: [],
                requestOrigin: undefined,
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'No WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL origins configured',
            )
            // With nothing configured we cannot judge the redirect origin, so
            // the mismatch warning must NOT fire (pins the `if
            // (hasConfiguredOrigins)` guard against an always-true mutant).
            expect(response.warnings).not.toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('ignores malformed configured origins and malformed request origin', () => {
            const response = buildAuthConfigHealth({
                clientId: 'test-client-id',
                redirectUri:
                    'https://lucky.lucassantana.tech/api/auth/callback',
                frontendOrigins: ['not-an-origin'],
                backendOrigins: ['still-not-an-origin'],
                requestOrigin: 'bad-origin',
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('returns degraded when client id differs from expected production app id', () => {
            const response = buildAuthConfigHealth({
                clientId: '111111111111111111',
                expectedClientId: 'test-client-id',
                redirectUri:
                    'https://lucky.lucassantana.tech/api/auth/callback',
                frontendOrigins: ['https://lucky.lucassantana.tech'],
                backendOrigins: ['https://lucky-api.lucassantana.tech'],
                sessionSecretConfigured: true,
                redisHealthy: true,
            })

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'CLIENT_ID does not match expected production app id (test-client-id)',
            )
        })

        test('warns and reports clientIdConfigured=false when client id is empty', () => {
            const response = buildAuthConfigHealth(base({ clientId: '' }))

            expect(response.warnings).toContain('CLIENT_ID not configured')
            expect(response.auth.clientIdConfigured).toBe(false)
            expect(response.status).toBe('degraded')
        })

        test('does not warn when client id matches expected after trimming whitespace', () => {
            // Pins `expectedClientId?.trim()` (a no-trim mutant leaves the
            // padded value, making it mismatch) and the `!==` comparison.
            const response = buildAuthConfigHealth(
                base({
                    clientId: 'prod-app-id',
                    expectedClientId: '  prod-app-id  ',
                }),
            )

            expect(response.warnings).not.toContain(
                'CLIENT_ID does not match expected production app id (prod-app-id)',
            )
            expect(response.status).toBe('ok')
        })

        test('warns when the session secret is not configured', () => {
            const response = buildAuthConfigHealth(
                base({ sessionSecretConfigured: false }),
            )

            expect(response.warnings).toContain(
                'WEBAPP_SESSION_SECRET not configured',
            )
            expect(response.auth.sessionSecretConfigured).toBe(false)
            expect(response.status).toBe('degraded')
        })

        test('warns when redis is not healthy', () => {
            const response = buildAuthConfigHealth(
                base({ redisHealthy: false }),
            )

            expect(response.warnings).toContain(
                'Redis is not healthy for shared services',
            )
            expect(response.auth.redisHealthy).toBe(false)
            expect(response.status).toBe('degraded')
        })

        test('ok when the redirect matches a frontend-only origin set', () => {
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://fe-only.tech/api/auth/callback',
                    frontendOrigins: ['https://fe-only.tech'],
                    backendOrigins: [],
                }),
            )

            expect(response.status).toBe('ok')
            expect(response.warnings).toEqual([])
        })

        test('degraded when frontend is the only configured origin and the redirect does not match it', () => {
            // Frontend-only + mismatch: pins that frontendOrigins alone makes
            // `hasConfiguredOrigins` true (a `length > 0 -> false` mutant would
            // skip the check and miss the mismatch).
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://elsewhere.tech/api/auth/callback',
                    frontendOrigins: ['https://fe-only.tech'],
                    backendOrigins: [],
                }),
            )

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('ok when the redirect matches a backend-only origin set', () => {
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://be-only.tech/api/auth/callback',
                    frontendOrigins: [],
                    backendOrigins: ['https://be-only.tech'],
                }),
            )

            expect(response.status).toBe('ok')
            // Backend IS configured → no "nothing configured" warning, and the
            // redirect matches → no mismatch warning. Isolates the backend
            // operand of `hasConfiguredOrigins` and the no-origins ternary.
            expect(response.warnings).toEqual([])
        })

        test('degraded when backend is the only configured origin and the redirect does not match it', () => {
            // Backend-only + mismatch: pins the backend operand of
            // `hasConfiguredOrigins` (a `length > 0 -> false` mutant would skip
            // the redirect check).
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://elsewhere.tech/api/auth/callback',
                    frontendOrigins: [],
                    backendOrigins: ['https://be-only.tech'],
                }),
            )

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('degraded when request origin is the only configured origin and the redirect does not match it', () => {
            // Request-origin-only + mismatch: pins the request-origin operand
            // of `hasConfiguredOrigins`.
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://elsewhere.tech/api/auth/callback',
                    frontendOrigins: [],
                    backendOrigins: [],
                    requestOrigin: 'https://req-only.tech',
                }),
            )

            expect(response.status).toBe('degraded')
            expect(response.warnings).toContain(
                'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
            )
        })

        test('ok when the redirect matches the request origin only', () => {
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://req-only.tech/api/auth/callback',
                    frontendOrigins: [],
                    backendOrigins: [],
                    requestOrigin: 'https://req-only.tech',
                }),
            )

            expect(response.status).toBe('ok')
            expect(response.warnings).toEqual([])
            expect(response.warnings).not.toContain(
                'No WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL origins configured',
            )
        })

        test('normalizes a path-bearing configured origin to its origin before matching', () => {
            // The redirect origin matches only after the configured origin is
            // run through `new URL(...).origin` (path stripped). Pins the
            // `.map(origin => new URL(origin).origin)` normalization.
            const response = buildAuthConfigHealth(
                base({
                    redirectUri: 'https://withpath.tech/api/auth/callback',
                    frontendOrigins: ['https://withpath.tech/dashboard/home'],
                    backendOrigins: [],
                }),
            )

            expect(response.status).toBe('ok')
            expect(response.warnings).toEqual([])
        })
    })
})
