import { beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useAuthRedirect } from './useAuthRedirect'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

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
        vi.mocked(toast.error).mockClear()
        vi.mocked(toast.success).mockClear()
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

    test('toasts the translated message for a known error code', () => {
        renderAt('/login?error=auth_failed')
        expect(toast.error).toHaveBeenCalledWith(
            'Authentication failed. Please try again.',
        )
    })

    test('falls back to the message param for an unknown error code', () => {
        renderAt('/login?error=weird&message=Custom%20failure')
        expect(toast.error).toHaveBeenCalledWith('Custom failure')
    })

    test('falls back to the generic message when nothing else is given', () => {
        renderAt('/login?error=weird')
        expect(toast.error).toHaveBeenCalledWith('An error occurred')
    })

    test('toasts success after a verified OAuth callback', async () => {
        checkAuth.mockResolvedValueOnce(true)
        vi.mocked(useAuthStore.getState).mockReturnValue({
            isAuthenticated: true,
        } as never)
        renderAt('/login?authenticated=true')
        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(
                'Successfully authenticated!',
            ),
        )
    })

    test('toasts a failure when the session check rejects', async () => {
        checkAuth.mockRejectedValueOnce(new Error('x'))
        renderAt('/login?authenticated=true')
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to verify authentication',
            ),
        )
    })
})
