import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
}

let authCheckPromise: Promise<boolean> | null = null

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,
            isLoading: true,
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
                        error instanceof Error
                            ? error.message
                            : 'Failed to logout'
                    toast.error(message)
                } finally {
                    set({
                        user: null,
                        isAuthenticated: false,
                        isDeveloper: false,
                    })
                }
            },

            checkAuth: async () => {
                if (authCheckPromise) {
                    return authCheckPromise
                }

                authCheckPromise = (async () => {
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
                                isDeveloper: Boolean(user.isDeveloper),
                            })

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
                        setTimeout(() => {
                            authCheckPromise = null
                        }, 100)
                    }
                })()

                return authCheckPromise
            },
        }),
        {
            name: 'lucky-auth',
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
                isDeveloper: state.isDeveloper,
            }),
        },
    ),
)
