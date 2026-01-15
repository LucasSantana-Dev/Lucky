import { create } from 'zustand'
import type { User } from '@/types'
import { api } from '@/services/api'
import { toast } from 'sonner'

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    isLoading: boolean
    isDeveloper: boolean
    login: () => void
    logout: () => Promise<void>
    checkAuth: () => Promise<void>
    checkDeveloperStatus: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isDeveloper: false,

    login: () => {
        window.location.href = api.auth.getDiscordLoginUrl()
    },

    logout: async () => {
        try {
            await api.auth.logout()
            toast.success('Logged out successfully')
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Failed to logout'
            toast.error(message)
        } finally {
            set({ user: null, isAuthenticated: false, isDeveloper: false })
        }
    },

    checkAuth: async () => {
        set({ isLoading: true })
        try {
            const response = await api.auth.checkStatus()
            if (response.data.authenticated && response.data.user) {
                const user = response.data.user
                set({ user, isAuthenticated: true, isLoading: false })
                const store = useAuthStore.getState()
                await store.checkDeveloperStatus()
            } else {
                set({
                    user: null,
                    isAuthenticated: false,
                    isLoading: false,
                    isDeveloper: false,
                })
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Failed to check authentication status'
            if (!message.includes('Network error')) {
                console.error('Auth check error:', error)
            }
            set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                isDeveloper: false,
            })
        }
    },

    checkDeveloperStatus: async () => {
        try {
            await api.features.getGlobalToggles()
            set({ isDeveloper: true })
        } catch (error: unknown) {
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { status?: number } }
                if (axiosError.response?.status === 403) {
                    set({ isDeveloper: false })
                } else {
                    set({ isDeveloper: false })
                }
            } else {
                set({ isDeveloper: false })
            }
        }
    },
}))
