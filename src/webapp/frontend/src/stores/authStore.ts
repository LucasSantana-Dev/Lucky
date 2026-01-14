import { create } from 'zustand'
import type { User } from '../types/auth'
import api from '../services/api'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  checkAuth: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  checkAuth: async () => {
    try {
      const response = await api.get<{ authenticated: boolean; user?: User }>('/auth/status')
      if (response.data.authenticated && response.data.user) {
        set({ user: response.data.user, isAuthenticated: true, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },
  logout: async () => {
    try {
      await api.get('/auth/logout')
    } catch {
    } finally {
      set({ user: null, isAuthenticated: false })
      window.location.href = '/api/auth/discord'
    }
  },
}))
