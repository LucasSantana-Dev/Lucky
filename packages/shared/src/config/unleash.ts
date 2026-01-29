import { initialize, type UnleashConfig } from 'unleash-client'
import { infoLog, errorLog, debugLog } from '../utils/general/log'

const unleashUrl = process.env.UNLEASH_URL ?? ''
const unleashApiToken = process.env.UNLEASH_API_TOKEN ?? ''
const unleashAppName = process.env.UNLEASH_APP_NAME ?? 'lukbot'
const unleashEnvironment = process.env.UNLEASH_ENVIRONMENT ?? 'development'

type BootstrapData = unknown

const bootstrapData: BootstrapData | undefined = process.env.UNLEASH_BOOTSTRAP_DATA
    ? (JSON.parse(process.env.UNLEASH_BOOTSTRAP_DATA) as BootstrapData)
    : undefined

const isUnleashConfigured =
    unleashUrl !== '' && unleashUrl !== 'http://localhost:4242/api'

const config: UnleashConfig = {
    appName: unleashAppName,
    url: isUnleashConfigured ? unleashUrl : 'http://localhost:4242/api',
    environment: unleashEnvironment,
    ...(unleashApiToken !== '' && {
        customHeaders: {
            Authorization: unleashApiToken,
        },
    }),
    ...(bootstrapData !== undefined && { bootstrap: { data: bootstrapData as unknown } }),
    refreshInterval: 15000,
    metricsInterval: 60000,
    disableMetrics: false,
} as UnleashConfig

export const unleash = isUnleashConfigured ? initialize(config) : null

if (unleash !== null) {
    unleash.on('ready', () => {
        infoLog({ message: 'Unleash client ready' })
    })

    unleash.on('error', (error: Error) => {
        errorLog({ message: 'Unleash client error:', error })
    })

    unleash.on('warn', (message: string) => {
        debugLog({ message: `Unleash warning: ${message}` })
    })

    unleash.on('synchronized', () => {
        debugLog({ message: 'Unleash synchronized with server' })
    })
} else {
    debugLog({ message: 'Unleash not configured, using fallback feature toggles' })
}

export function isUnleashEnabled(): boolean {
    return isUnleashConfigured && unleash !== null
}
