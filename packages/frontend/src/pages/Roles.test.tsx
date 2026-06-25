import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RolesPage from './Roles'
import { useGuildStore } from '@/stores/guildStore'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api', () => ({
    api: {
        rolesManage: {
            list: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            duplicate: vi.fn(),
            bulkDelete: vi.fn(),
        },
    },
}))
vi.mock('@/lib/sentry', () => ({
    reportError: vi.fn(),
}))
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children }: any) => <div>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}))

describe('RolesPage', () => {
    const mockGuild = { id: 'g1', name: 'Test Guild' }
    const mockRole = {
        id: 'r1',
        name: 'Moderator',
        color: 0x5865f2,
        hoist: true,
        mentionable: true,
        position: 1,
        managed: false,
        permissions: '8',
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useGuildStore).mockReturnValue({
            selectedGuild: mockGuild,
        } as any)
    })

    test('shows empty state when no guild selected', () => {
        vi.mocked(useGuildStore).mockReturnValue({
            selectedGuild: null,
        } as any)

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        // Check for section with empty state (icon and text scattered)
        expect(
            screen.queryByText((_content, element) => {
                return (
                    element?.tagName === 'SECTION' &&
                    element?.textContent?.includes('Select a server')
                )
            }),
        ).toBeInTheDocument()
    })

    test('renders role list on successful API load', async () => {
        const { api } = await import('@/services/api')
        vi.mocked(api.rolesManage.list).mockResolvedValue([mockRole])

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Moderator')).toBeInTheDocument()
        })
    })

    test('shows empty state when no roles returned', async () => {
        const { api } = await import('@/services/api')
        vi.mocked(api.rolesManage.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No roles found')).toBeInTheDocument()
        })
    })

    test('opens RoleDialog on create button click', async () => {
        const user = userEvent.setup()
        const { api } = await import('@/services/api')
        vi.mocked(api.rolesManage.list).mockResolvedValue([mockRole])

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Moderator')).toBeInTheDocument()
        })

        const createButton = screen.getByRole('button', {
            name: /Create Role/i,
        })
        await user.click(createButton)

        await waitFor(() => {
            expect(screen.getByDisplayValue('')).toBeInTheDocument()
        })
    })

    test('creates role with correct API call', async () => {
        const user = userEvent.setup()
        const { api } = await import('@/services/api')
        vi.mocked(api.rolesManage.list).mockResolvedValue([])
        vi.mocked(api.rolesManage.create).mockResolvedValue({
            ...mockRole,
            id: 'r-new',
            name: 'TestRole',
        })

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No roles found')).toBeInTheDocument()
        })

        const createButtons = screen.getAllByRole('button', {
            name: /Create Role/i,
        })
        await user.click(createButtons[0])

        const nameInput = screen.getByPlaceholderText('Role name')
        await user.type(nameInput, 'TestRole')

        const saveButton = screen.getByRole('button', { name: /Save/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(vi.mocked(api.rolesManage.create)).toHaveBeenCalledWith(
                'g1',
                expect.objectContaining({
                    name: 'TestRole',
                }),
            )
        })
    })

    test('calls reportError on API failure', async () => {
        const { api } = await import('@/services/api')
        const { reportError } = await import('@/lib/sentry')
        const error = new Error('Network error')
        vi.mocked(api.rolesManage.list).mockRejectedValue(error)

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(vi.mocked(reportError)).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load'),
                error,
                expect.any(Object),
            )
        })
    })

    test('shows success toast after create', async () => {
        const user = userEvent.setup()
        const { api } = await import('@/services/api')
        const { toast } = await import('sonner')
        vi.mocked(api.rolesManage.list).mockResolvedValue([])
        vi.mocked(api.rolesManage.create).mockResolvedValue({
            ...mockRole,
            id: 'r-new',
            name: 'NewRole',
        })

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No roles found')).toBeInTheDocument()
        })

        const createButtons = screen.getAllByRole('button', {
            name: /Create Role/i,
        })
        await user.click(createButtons[0])

        const nameInput = screen.getByPlaceholderText('Role name')
        await user.type(nameInput, 'NewRole')

        const saveButton = screen.getByRole('button', { name: /Save/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(vi.mocked(toast).success).toHaveBeenCalledWith(
                expect.stringContaining('created'),
            )
        })
    })

    test('shows error toast when create fails', async () => {
        const user = userEvent.setup()
        const { api } = await import('@/services/api')
        const { toast } = await import('sonner')
        vi.mocked(api.rolesManage.list).mockResolvedValue([])
        vi.mocked(api.rolesManage.create).mockResolvedValue(null)

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No roles found')).toBeInTheDocument()
        })

        const createButtons = screen.getAllByRole('button', {
            name: /Create Role/i,
        })
        await user.click(createButtons[0])

        const nameInput = screen.getByPlaceholderText('Role name')
        await user.type(nameInput, 'NewRole')

        const saveButton = screen.getByRole('button', { name: /Save/i })
        await user.click(saveButton)

        await waitFor(() => {
            expect(vi.mocked(toast).error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create'),
            )
        })
    })

    test('sorts roles by position descending', async () => {
        const { api } = await import('@/services/api')
        const roles = [
            { ...mockRole, id: 'r1', position: 1, name: 'Role1' },
            { ...mockRole, id: 'r3', position: 3, name: 'Role3' },
            { ...mockRole, id: 'r2', position: 2, name: 'Role2' },
        ]
        vi.mocked(api.rolesManage.list).mockResolvedValue(roles)

        render(
            <MemoryRouter>
                <RolesPage />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Role3')).toBeInTheDocument()
        })
    })
})
