interface AuthConfigHealthInput {
    clientId: string
    redirectUri: string
    frontendOrigins: string[]
    backendOrigins?: string[]
    requestOrigin?: string
    sessionSecretConfigured: boolean
    redisHealthy: boolean
    expectedClientId?: string
}

interface AuthConfigHealthResponse {
    status: 'ok' | 'degraded'
    auth: {
        clientId: string
        redirectUri: string
        frontendOrigins: string[]
        clientIdConfigured: boolean
        sessionSecretConfigured: boolean
        redisHealthy: boolean
        authorizeUrlPreview: string
    }
    warnings: string[]
}

const DISCORD_AUTHORIZE_BASE = 'https://discord.com/api/oauth2/authorize'
const OAUTH_SCOPE = 'identify guilds'

const getConfiguredFrontendOrigins = (
    frontendOrigins: string[],
): Set<string> => {
    const normalizedOrigins = frontendOrigins
        .map((origin) => {
            try {
                return new URL(origin).origin
            } catch {
                return ''
            }
        })
        .filter((origin) => origin.length > 0)

    return new Set(normalizedOrigins)
}

const normalizeOrigin = (value?: string): string => {
    if (!value) return ''

    try {
        return new URL(value).origin
    } catch {
        return ''
    }
}

export function buildAuthorizeUrlPreview(
    clientId: string,
    redirectUri: string,
): string {
    if (!clientId) {
        return ''
    }

    const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: OAUTH_SCOPE,
    })

    return `${DISCORD_AUTHORIZE_BASE}?${query.toString().replace(/\+/g, '%20')}`
}

export function buildAuthConfigHealth({
    clientId,
    redirectUri,
    frontendOrigins,
    backendOrigins = [],
    requestOrigin,
    sessionSecretConfigured,
    redisHealthy,
    expectedClientId,
}: AuthConfigHealthInput): AuthConfigHealthResponse {
    const warnings: string[] = []
    const clientIdConfigured = clientId.length > 0
    const normalizedExpectedClientId = expectedClientId?.trim() ?? ''

    if (!clientIdConfigured) {
        warnings.push('CLIENT_ID not configured')
    }

    if (
        normalizedExpectedClientId.length > 0 &&
        clientIdConfigured &&
        clientId !== normalizedExpectedClientId
    ) {
        warnings.push(
            `CLIENT_ID does not match expected production app id (${normalizedExpectedClientId})`,
        )
    }

    if (!sessionSecretConfigured) {
        warnings.push('WEBAPP_SESSION_SECRET not configured')
    }

    if (!redisHealthy) {
        warnings.push('Redis is not healthy for shared services')
    }

    const normalizedRequestOrigin = normalizeOrigin(requestOrigin)

    if (
        frontendOrigins.length === 0 &&
        backendOrigins.length === 0 &&
        normalizedRequestOrigin.length === 0
    ) {
        warnings.push(
            'No WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL origins configured',
        )
    }

    try {
        const parsedRedirectUri = new URL(redirectUri)

        if (parsedRedirectUri.pathname !== '/api/auth/callback') {
            warnings.push('OAuth callback path should be /api/auth/callback')
        }

        if (
            frontendOrigins.length > 0 ||
            backendOrigins.length > 0 ||
            normalizedRequestOrigin.length > 0
        ) {
            const configuredOrigins = new Set([
                ...getConfiguredFrontendOrigins(frontendOrigins),
                ...getConfiguredFrontendOrigins(backendOrigins),
            ])
            if (normalizedRequestOrigin.length > 0) {
                configuredOrigins.add(normalizedRequestOrigin)
            }

            if (!configuredOrigins.has(parsedRedirectUri.origin)) {
                warnings.push(
                    'OAuth redirect origin is not in WEBAPP_FRONTEND_URL or WEBAPP_BACKEND_URL',
                )
            }
        }
    } catch {
        warnings.push('OAuth redirect URI is invalid')
    }

    return {
        status: warnings.length === 0 ? 'ok' : 'degraded',
        auth: {
            clientId,
            redirectUri,
            frontendOrigins,
            clientIdConfigured,
            sessionSecretConfigured,
            redisHealthy,
            authorizeUrlPreview: buildAuthorizeUrlPreview(
                clientId,
                redirectUri,
            ),
        },
        warnings,
    }
}
