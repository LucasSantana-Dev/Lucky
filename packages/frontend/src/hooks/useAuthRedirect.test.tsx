import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthRedirect } from './useAuthRedirect'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/stores/authStore')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const checkAuth = vi.fn().mockResolvedValue(false)

function renderAt(path: string) {
    return renderHook(() => useAuthRedirect(), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
        ),
    })
}

describe('useAuthRedirect', () => {
    beforeEach(() => {
        checkAuth.mockClear()
        vi.mocked(useAuthStore).mockReturnValue({ checkAuth } as never)
        vi.mocked(useAuthStore.getState).mockReturnValue({
            isAuthenticated: false,
        } as never)
    })

    test('does not re-check the session on a bare /login (#2204)', () => {
        renderAt('/login')
        expect(checkAuth).not.toHaveBeenCalled()
    })

    test('re-checks the session after the OAuth callback', () => {
        renderAt('/login?authenticated=true')
        expect(checkAuth).toHaveBeenCalledTimes(1)
    })

    test('does not re-check the session on an OAuth error', () => {
        renderAt('/login?error=auth_failed')
        expect(checkAuth).not.toHaveBeenCalled()
    })
})
