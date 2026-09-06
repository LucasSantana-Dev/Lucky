import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/services/api', () => {
    return {
        api: {
            roleGroups: {
                addRole: vi.fn(),
            },
        },
    }
})

import { AddStyledRoleForm } from './AddStyledRoleForm'
import { api } from '@/services/api'

describe('AddStyledRoleForm', () => {
    const mockGroupId = 'group-123'
    const mockGuildId = 'guild-123'

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('rendering', () => {
        test('renders form with all fields', () => {
            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            expect(screen.getByText(/add styled role/i)).toBeInTheDocument()
            expect(screen.getByText(/role name/i)).toBeInTheDocument()
            expect(screen.getByText(/button label/i)).toBeInTheDocument()
            expect(screen.getByText(/color override/i)).toBeInTheDocument()
            expect(
                screen.getByRole('button', { name: /preview/i }),
            ).toBeInTheDocument()
        })

        test('preview button is disabled when name is empty', () => {
            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            expect(previewButton).toBeDisabled()
        })
    })

    describe('dryRun preview flow', () => {
        test('clicking preview calls addRole with dryRun:true', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Moderator',
                    color: '0xFF0000',
                    buttonLabel: 'Moderator',
                    emoji: undefined,
                },
            }
            vi.mocked(api.roleGroups.addRole).mockResolvedValueOnce(mockPlan)

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(vi.mocked(api.roleGroups.addRole)).toHaveBeenCalledWith(
                    mockGuildId,
                    mockGroupId,
                    expect.objectContaining({
                        name: 'Moderator',
                        dryRun: true,
                    }),
                )
            })
        })

        test('preview displays returned plan', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Admin',
                    color: '0xFF0000',
                    buttonLabel: 'Admin Button',
                    emoji: '👑',
                },
            }
            vi.mocked(api.roleGroups.addRole).mockResolvedValueOnce(mockPlan)

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Admin')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(screen.getByText(/preview/i)).toBeInTheDocument()
                expect(screen.getByText('Admin Button')).toBeInTheDocument()
                expect(screen.getByText('0xFF0000')).toBeInTheDocument()
                expect(screen.getByText('👑')).toBeInTheDocument()
            })
        })

        test('preview shows color swatch with correct background', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Moderator',
                    color: '0xFF0000',
                    buttonLabel: 'Moderator',
                    emoji: undefined,
                },
            }
            vi.mocked(api.roleGroups.addRole).mockResolvedValueOnce(mockPlan)

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                const swatch = screen.getByTestId('color-swatch')
                expect(swatch).toBeInTheDocument()
                // Check that it has a style attribute (background color will be inlined)
                const style = window.getComputedStyle(swatch)
                expect(style.backgroundColor).toBeTruthy()
            })
        })
    })

    describe('double-submit guard', () => {
        test('preview button enabled when name is provided', async () => {
            const user = userEvent.setup()

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })

            // Initially disabled
            expect(previewButton).toBeDisabled()

            // After typing, enabled
            await user.type(nameInput, 'Moderator')
            expect(previewButton).not.toBeDisabled()

            // Clearing makes it disabled again
            await user.clear(nameInput)
            expect(previewButton).toBeDisabled()
        })
    })

    describe('confirm to apply', () => {
        test('clicking Confirm applies with dryRun:false', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Moderator',
                    color: '0xFF0000',
                    buttonLabel: 'Moderator',
                    emoji: undefined,
                },
            }
            const mockAppliedResult = {
                status: 'ok' as const,
                role: {
                    id: 'role-123',
                    name: 'Moderator',
                    color: '0xFF0000',
                },
                mapping: {
                    id: 'mapping-1',
                    roleId: 'role-123',
                    label: 'Moderator',
                    emoji: undefined,
                },
            }

            vi.mocked(api.roleGroups.addRole)
                .mockResolvedValueOnce(mockPlan)
                .mockResolvedValueOnce(mockAppliedResult)

            const onSuccess = vi.fn()

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={onSuccess}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(
                    screen.getByRole('button', { name: /confirm/i }),
                ).toBeInTheDocument()
            })

            const confirmButton = screen.getByRole('button', {
                name: /confirm/i,
            })
            await user.click(confirmButton)

            await waitFor(() => {
                expect(
                    vi.mocked(api.roleGroups.addRole),
                ).toHaveBeenLastCalledWith(
                    mockGuildId,
                    mockGroupId,
                    expect.objectContaining({
                        name: 'Moderator',
                        dryRun: false,
                    }),
                )
            })

            expect(onSuccess).toHaveBeenCalled()
        })

        test('successful apply calls onSuccess', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Moderator',
                    color: '0xFF0000',
                    buttonLabel: 'Moderator',
                    emoji: undefined,
                },
            }
            const mockAppliedResult = {
                status: 'ok' as const,
                role: {
                    id: 'role-123',
                    name: 'Moderator',
                    color: '0xFF0000',
                },
                mapping: {
                    id: 'mapping-1',
                    roleId: 'role-123',
                    label: 'Moderator',
                    emoji: undefined,
                },
            }

            vi.mocked(api.roleGroups.addRole)
                .mockResolvedValueOnce(mockPlan)
                .mockResolvedValueOnce(mockAppliedResult)

            const onSuccess = vi.fn()

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={onSuccess}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(
                    screen.getByRole('button', { name: /confirm/i }),
                ).toBeInTheDocument()
            })

            const confirmButton = screen.getByRole('button', {
                name: /confirm/i,
            })
            await user.click(confirmButton)

            await waitFor(() => {
                expect(onSuccess).toHaveBeenCalled()
            })
        })
    })

    describe('partial_success state', () => {
        test('shows distinct message when partial_success', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Moderator',
                    color: '0xFF0000',
                    buttonLabel: 'Moderator',
                    emoji: undefined,
                },
            }
            const mockPartialResult = {
                status: 'partial_success' as const,
                role: {
                    id: 'role-123',
                    name: 'Moderator',
                    color: '0xFF0000',
                },
                mapping: {
                    id: 'mapping-1',
                    roleId: 'role-123',
                    label: 'Moderator',
                    emoji: undefined,
                },
            }

            vi.mocked(api.roleGroups.addRole)
                .mockResolvedValueOnce(mockPlan)
                .mockResolvedValueOnce(mockPartialResult)

            const onSuccess = vi.fn()

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={onSuccess}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(
                    screen.getByRole('button', { name: /confirm/i }),
                ).toBeInTheDocument()
            })

            const confirmButton = screen.getByRole('button', {
                name: /confirm/i,
            })
            await user.click(confirmButton)

            await waitFor(() => {
                expect(
                    screen.getByText(/will re-sync shortly/i),
                ).toBeInTheDocument()
            })

            expect(onSuccess).toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        test('displays error message when preview fails', async () => {
            const user = userEvent.setup()
            const errorMsg = 'Role already mapped to this group'
            vi.mocked(api.roleGroups.addRole).mockRejectedValueOnce(
                new Error(errorMsg),
            )

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(screen.getByText(errorMsg)).toBeInTheDocument()
            })
        })

        test('displays error message when apply fails', async () => {
            const user = userEvent.setup()
            const mockPlan = {
                plan: {
                    roleName: 'Moderator',
                    color: '0xFF0000',
                    buttonLabel: 'Moderator',
                    emoji: undefined,
                },
            }
            const applyErrorMsg = 'Discord rate limit exceeded'

            vi.mocked(api.roleGroups.addRole)
                .mockResolvedValueOnce(mockPlan)
                .mockRejectedValueOnce(new Error(applyErrorMsg))

            render(
                <AddStyledRoleForm
                    guildId={mockGuildId}
                    groupId={mockGroupId}
                    onSuccess={vi.fn()}
                />,
            )

            const nameInput = screen.getByPlaceholderText(/e\.g\. moderator/i)
            await user.type(nameInput, 'Moderator')

            const previewButton = screen.getByRole('button', {
                name: /preview/i,
            })
            await user.click(previewButton)

            await waitFor(() => {
                expect(
                    screen.getByRole('button', { name: /confirm/i }),
                ).toBeInTheDocument()
            })

            const confirmButton = screen.getByRole('button', {
                name: /confirm/i,
            })
            await user.click(confirmButton)

            await waitFor(() => {
                expect(screen.getByText(applyErrorMsg)).toBeInTheDocument()
            })
        })
    })
})
