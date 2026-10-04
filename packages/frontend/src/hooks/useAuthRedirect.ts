import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'

export function useAuthRedirect() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const { checkAuth } = useAuthStore()
    const hasProcessedAuth = useRef(false)

    useEffect(() => {
        if (hasProcessedAuth.current) return

        const authenticated = searchParams.get('authenticated')
        const errorParam = searchParams.get('error')
        const errorMessage = searchParams.get('message')

        if (errorParam) {
            hasProcessedAuth.current = true
            const knownErrors = [
                'auth_failed',
                'missing_code',
                'missing_state',
                'invalid_state',
                'session_failed',
                'authentication_error',
                'client_id_not_configured',
                'redirect_error',
            ]
            const errorText = knownErrors.includes(errorParam)
                ? t(`login.errors.${errorParam}`)
                : errorMessage || t('login.errors.generic')

            toast.error(errorText)
        } else if (authenticated === 'true') {
            hasProcessedAuth.current = true
            checkAuth()
                .then(() => {
                    const authState = useAuthStore.getState()
                    if (authState.isAuthenticated) {
                        toast.success(t('login.authenticated'))
                        navigate('/servers', { replace: true })
                    }
                })
                .catch(() => {
                    toast.error(t('login.verifyFailed'))
                })
        }
        // No bare checkAuth() here: App already verifies the session on boot,
        // and /login sits behind its loading gate, so re-checking from this
        // page flips isLoading, unmounts the page, and re-runs this effect on
        // remount: an unbounded request loop that never renders the button.
    }, [searchParams, checkAuth, navigate, t])
}
