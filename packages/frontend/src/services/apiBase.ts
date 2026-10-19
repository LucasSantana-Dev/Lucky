type ApiLocation = {
    protocol: string
    hostname: string
}

function isLuckyManagedHost(hostname: string): boolean {
    return (
        hostname === 'lucassantana.tech' ||
        hostname.endsWith('.lucassantana.tech')
    )
}

function isHomeServerHost(hostname: string): boolean {
    return (
        hostname === 'luk-homeserver.com.br' ||
        hostname.endsWith('.luk-homeserver.com.br')
    )
}

export function inferApiBase(
    configuredApiBase?: string,
    location?: ApiLocation,
): string {
    const configured = configuredApiBase?.trim()
    if (configured) {
        return configured
    }

    const hostname = location?.hostname
    if (!hostname) {
        return '/api'
    }

    if (isLuckyManagedHost(hostname)) {
        // VITE_API_BASE_URL should be set on Cloudflare Pages builds. When it
        // is missing the fallback works on nginx-proxied deploys but silently
        // returns HTML on CF Pages. Log at error level so Sentry catches it.
        console.error(
            '[apiBase] VITE_API_BASE_URL is not set on a managed host (%s); ' +
                'falling back to /api — API calls will fail if there is no nginx proxy.',
            hostname,
        )
        return '/api'
    }

    if (isHomeServerHost(hostname)) {
        const protocol = location.protocol || 'https:'
        return `${protocol}//api.luk-homeserver.com.br/api`
    }

    return '/api'
}
