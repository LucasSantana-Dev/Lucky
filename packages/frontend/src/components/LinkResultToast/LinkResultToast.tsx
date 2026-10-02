import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const KNOWN_ERROR_CODES = new Set([
    'spotify_connect_error',
    'spotify_exchange_failed',
    'spotify_invalid_state',
    'spotify_missing_code',
    'spotify_missing_state',
    'spotify_not_configured',
    'spotify_save_failed',
    'lastfm_callback_error',
    'lastfm_connect_error',
    'lastfm_exchange_failed',
    'lastfm_invalid_state',
    'lastfm_missing_state',
    'lastfm_missing_token',
    'lastfm_not_configured',
    'lastfm_save_failed',
])

const SUCCESS_PARAMS = [
    ['spotify_linked', 'linkResult.spotifyLinked'],
    ['lastfm_linked', 'linkResult.lastfmLinked'],
] as const

/**
 * Reads the provider link redirect params (`*_linked=true`, `error=<code>`)
 * once, shows a toast and removes them from the URL. Renders nothing.
 */
export default function LinkResultToast() {
    const { t } = useTranslation()
    const [searchParams, setSearchParams] = useSearchParams()
    const handled = useRef(false)

    useEffect(() => {
        if (handled.current) return

        const next = new URLSearchParams(searchParams)
        let touched = false

        for (const [param, key] of SUCCESS_PARAMS) {
            if (searchParams.get(param) === 'true') {
                toast.success(t(key))
                next.delete(param)
                touched = true
            }
        }

        const errorCode = searchParams.get('error')
        if (errorCode !== null) {
            const key = KNOWN_ERROR_CODES.has(errorCode)
                ? `linkResult.errors.${errorCode}`
                : 'linkResult.errors.generic'
            toast.error(t(key))
            next.delete('error')
            touched = true
        }

        if (!touched) return
        handled.current = true
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams, t])

    return null
}
