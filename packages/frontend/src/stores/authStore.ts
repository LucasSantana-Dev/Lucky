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
    checkAuth: () => Promise<boolean>
    checkDeveloperStatus: () => Promise<void>
}

// Module-level promise to prevent concurrent auth checks
let authCheckPromise: Promise<boolean> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true, // Start as true
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
        // Return existing promise if check is already in progress
        if (authCheckPromise) {
            return authCheckPromise
        }

        // Create new auth check promise
        authCheckPromise = (async () => {
            // Only set loading if not already authenticated
            const currentState = get()
            if (!currentState.isAuthenticated) {
                set({ isLoading: true })
            }

            try {
                const response = await api.auth.checkStatus()

                if (response.data.authenticated && response.data.user) {
                    const user = response.data.user
                    set({
                        user,
                        isAuthenticated: true,
                        isLoading: false,
                    })

                    // Check developer status asynchronously
                    get()
                        .checkDeveloperStatus()
                        .catch(() => {})

                    return true
                } else {
                    set({
                        user: null,
                        isAuthenticated: false,
                        isLoading: false,
                        isDeveloper: false,
                    })
                    return false
                }
            } catch {
                set({
                    user: null,
                    isAuthenticated: false,
                    isLoading: false,
                    isDeveloper: false,
                })
                return false
            } finally {
                // Clear the promise after a short delay to allow for state updates
                setTimeout(() => {
                    authCheckPromise = null
                }, 100)
            }
        })()

        return authCheckPromise
    },

    checkDeveloperStatus: async () => {
        try {
            await api.features.getGlobalToggles()
            set({ isDeveloper: true })
        } catch (error: unknown) {
            set({ isDeveloper: false })
        }
    },
}))
