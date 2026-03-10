const DEFAULT_FRONTEND_URL = 'http://localhost:5173'

export function getFrontendOrigins(): string[] {
    const configured = process.env.WEBAPP_FRONTEND_URL ?? DEFAULT_FRONTEND_URL
    const origins = configured
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)

    return origins.length > 0 ? origins : [DEFAULT_FRONTEND_URL]
}

export function getPrimaryFrontendUrl(): string {
    return getFrontendOrigins()[0]
}
