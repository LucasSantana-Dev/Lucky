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
        return '/api'
    }

    if (isHomeServerHost(hostname)) {
        const protocol = location.protocol || 'https:'
        return `${protocol}//api.luk-homeserver.com.br/api`
    }

    return '/api'
}
