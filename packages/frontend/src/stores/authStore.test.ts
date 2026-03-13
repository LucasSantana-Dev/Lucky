import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock('@/services/api', () => ({
    api: {
        auth: {
            checkStatus: vi.fn(),
            logout: vi.fn(),
            getDiscordLoginUrl: vi.fn(() => '/api/auth/discord'),
        },
        features: {
            getGlobalToggles: vi.fn(),
        },
    },
}))

vi.mock('zustand/middleware', async () => {
    const actual = await vi.importActual<typeof import('zustand/middleware')>(
        'zustand/middleware',
    )

    return {
        ...actual,
        persist: <T>(stateCreator: T) => stateCreator,
    }
})

import { api } from '@/services/api'
import { useAuthStore } from './authStore'

const baseState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    isDeveloper: false,
}

describe('authStore', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useAuthStore.setState(baseState)
    })

    afterEach(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120))
    })

    test('sets developer state from auth status response and avoids global toggle probe', async () => {
        vi.mocked(api.auth.checkStatus).mockResolvedValue({
            data: {
                authenticated: true,
                user: {
                    id: 'user-1',
                    username: 'luk',
                    avatar: null,
                    isDeveloper: false,
                },
            },
        } as never)

        const authenticated = await useAuthStore.getState().checkAuth()

        expect(authenticated).toBe(true)
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().isDeveloper).toBe(false)
        expect(api.features.getGlobalToggles).not.toHaveBeenCalled()
    })

    test('marks authenticated developer users from auth status payload', async () => {
        vi.mocked(api.auth.checkStatus).mockResolvedValue({
            data: {
                authenticated: true,
                user: {
                    id: 'developer-1',
                    username: 'dev',
                    avatar: null,
                    isDeveloper: true,
                },
            },
        } as never)

        await useAuthStore.getState().checkAuth()

        expect(useAuthStore.getState().isDeveloper).toBe(true)
    })
})
