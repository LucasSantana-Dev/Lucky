import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'

export function useAuthRedirect() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { checkAuth } = useAuthStore()
    const hasProcessedAuth = useRef(false)

    useEffect(() => {
        if (hasProcessedAuth.current) return

        const authenticated = searchParams.get('authenticated')
        const errorParam = searchParams.get('error')
        const errorMessage = searchParams.get('message')

        if (errorParam) {
            hasProcessedAuth.current = true
            const messages: Record<string, string> = {
                auth_failed: 'Authentication failed. Please try again.',
                missing_code: 'Missing authorization code. Please try again.',
                missing_state: 'Security validation failed. Please try again.',
                invalid_state: 'Invalid security token. Please try again.',
                session_failed: 'Failed to create session. Please try again.',
                authentication_error:
                    'An error occurred during authentication. Please try again.',
                client_id_not_configured:
                    'Authentication service is not properly configured. Please contact support.',
                redirect_error:
                    'Failed to redirect to authentication service. Please try again.',
            }
            const errorText =
                messages[errorParam] || errorMessage || 'An error occurred'

            toast.error(errorText)
        } else if (authenticated === 'true') {
            hasProcessedAuth.current = true
            checkAuth()
                .then(() => {
                    const authState = useAuthStore.getState()
                    if (authState.isAuthenticated) {
                        toast.success('Successfully authenticated!')
                        navigate('/servers', { replace: true })
                    }
                })
                .catch((error) => {
                    console.error('Auth check failed:', error)
                    toast.error('Failed to verify authentication')
                })
        } else {
            checkAuth()
        }
    }, [searchParams, checkAuth, navigate])
}
