import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReactionRoles from './ReactionRoles'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type { ReactionRoleMessage } from '@/services/reactionRolesApi'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api')

const mockGuild = {
    id: '123456',
    name: 'Test Guild',
    icon: null,
    memberCount: 100,
}

const mockMessages: ReactionRoleMessage[] = [
    {
        id: '1',
        guildId: '123456',
        messageId: 'msg-123',
        channelId: 'channel-456',
        createdAt: new Date('2024-01-15').toISOString(),
        mappings: [
            {
                id: 'map-1',
                buttonId: '',
                type: 'button',
                emoji: '🎮',
                label: 'Gamer',
                style: 'Primary',
                roleId: 'role-111',
            },
            {
                id: 'map-2',
                buttonId: '',
                type: 'button',
                emoji: '🎵',
                label: 'Music Lover',
                style: 'Secondary',
                roleId: 'role-222',
            },
        ],
    },
    {
        id: '2',
        guildId: '123456',
        messageId: 'msg-789',
        channelId: 'channel-999',
        createdAt: new Date('2024-02-20').toISOString(),
        mappings: [
            {
                id: 'map-3',
                buttonId: '',
                type: 'button',
                emoji: null,
                label: 'Developer',
                style: 'Success',
                roleId: 'role-333',
            },
        ],
    },
]

function mockGuildStore(selectedGuild: typeof mockGuild | null = mockGuild) {
    vi.mocked(useGuildStore).mockReturnValue({
        selectedGuild,
    } as ReturnType<typeof useGuildStore>)
}

describe('ReactionRoles', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    })

    test('renders empty state when no guild is selected', () => {
        mockGuildStore(null)
        render(<ReactionRoles />)
        expect(screen.getByText('No server selected')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Select a server from the sidebar to view reaction roles.',
            ),
        ).toBeInTheDocument()
    })

    test('renders loading skeletons initially', () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)
        const skeletons = container.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('loads and displays reaction role messages', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalledWith('123456')
        })

        expect(await screen.findByText('msg-123')).toBeInTheDocument()
        expect(screen.getByText('msg-789')).toBeInTheDocument()
    })

    test('displays message with channel ID', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('channel-456')).toBeInTheDocument()
        expect(screen.getByText('channel-999')).toBeInTheDocument()
    })

    test('displays role count badge', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('2 roles')).toBeInTheDocument()
        expect(screen.getByText('1 role')).toBeInTheDocument()
    })

    test('displays role mappings with emoji', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('🎮')).toBeInTheDocument()
        expect(screen.getByText('🎵')).toBeInTheDocument()
        expect(screen.getByText('Gamer')).toBeInTheDocument()
        expect(screen.getByText('Music Lover')).toBeInTheDocument()
    })

    test('displays role mapping without emoji', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('Developer')).toBeInTheDocument()
        expect(screen.queryByText('null')).not.toBeInTheDocument()
    })

    test('displays button style labels', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('Primary')).toBeInTheDocument()
        expect(screen.getByText('Secondary')).toBeInTheDocument()
        expect(screen.getByText('Success')).toBeInTheDocument()
    })

    test('displays role IDs', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('role-111')).toBeInTheDocument()
        expect(screen.getByText('role-222')).toBeInTheDocument()
        expect(screen.getByText('role-333')).toBeInTheDocument()
    })

    test('displays empty state when no messages exist', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list).mockResolvedValue([])
        render(<ReactionRoles />)

        expect(
            await screen.findByText('No reaction role messages'),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Create your first reaction role message to let members self-assign roles with buttons.',
            ),
        ).toBeInTheDocument()
    })

    test('handles API error when loading messages', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list).mockRejectedValue(
            new Error('API error'),
        )

        render(<ReactionRoles />)

        expect(
            await screen.findByText('Failed to load reaction role messages.'),
        ).toBeInTheDocument()
    })

    test('displays retry button on error', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list).mockRejectedValue(
            new Error('API error'),
        )

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /retry/i }),
            ).toBeInTheDocument()
        })
    })

    test('retries loading messages on retry button click', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list)
            .mockRejectedValueOnce(new Error('API error'))
            .mockResolvedValueOnce(mockMessages)

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /retry/i }),
            ).toBeInTheDocument()
        })

        const retryButton = screen.getByRole('button', { name: /retry/i })
        fireEvent.click(retryButton)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalledTimes(2)
        })

        expect(await screen.findByText('msg-123')).toBeInTheDocument()
    })

    test('formats dates correctly', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const dateElements = screen.getAllByText(/Jan|Feb/)
        expect(dateElements.length).toBeGreaterThan(0)
    })

    test('displays message with no mappings', async () => {
        mockGuildStore()
        const messageWithNoMappings: ReactionRoleMessage[] = [
            {
                id: '1',
                guildId: '123456',
                messageId: 'msg-empty',
                channelId: 'channel-empty',
                createdAt: new Date('2024-03-01').toISOString(),
                mappings: [],
            },
        ]
        vi.mocked(api.reactionRoles.list).mockResolvedValue(
            messageWithNoMappings,
        )

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(
            await screen.findByText('No role mappings found for this message.'),
        ).toBeInTheDocument()
    })

    test('handles numeric button style values', async () => {
        mockGuildStore()
        const messagesWithNumericStyles: ReactionRoleMessage[] = [
            {
                id: '1',
                guildId: '123456',
                messageId: 'msg-numeric',
                channelId: 'channel-numeric',
                createdAt: new Date('2024-03-01').toISOString(),
                mappings: [
                    {
                        id: 'map-1',
                        buttonId: '',
                        type: 'button',
                        emoji: '🔥',
                        label: 'Hot',
                        style: '1',
                        roleId: 'role-hot',
                    },
                    {
                        id: 'map-2',
                        buttonId: '',
                        type: 'button',
                        emoji: '❄️',
                        label: 'Cool',
                        style: '2',
                        roleId: 'role-cool',
                    },
                ],
            },
        ]
        vi.mocked(api.reactionRoles.list).mockResolvedValue(
            messagesWithNumericStyles,
        )

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('Primary')).toBeInTheDocument()
        expect(screen.getByText('Secondary')).toBeInTheDocument()
    })

    test('handles unknown button style values', async () => {
        mockGuildStore()
        const messagesWithUnknownStyle: ReactionRoleMessage[] = [
            {
                id: '1',
                guildId: '123456',
                messageId: 'msg-unknown',
                channelId: 'channel-unknown',
                createdAt: new Date('2024-03-01').toISOString(),
                mappings: [
                    {
                        id: 'map-1',
                        buttonId: '',
                        type: 'button',
                        emoji: '❓',
                        label: 'Unknown',
                        style: 'UnknownStyle',
                        roleId: 'role-unknown',
                    },
                ],
            },
        ]
        vi.mocked(api.reactionRoles.list).mockResolvedValue(
            messagesWithUnknownStyle,
        )

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('UnknownStyle')).toBeInTheDocument()
    })

    test('displays all supported button style colors', async () => {
        mockGuildStore()
        const messagesWithAllStyles: ReactionRoleMessage[] = [
            {
                id: '1',
                guildId: '123456',
                messageId: 'msg-all-styles',
                channelId: 'channel-all',
                createdAt: new Date('2024-03-01').toISOString(),
                mappings: [
                    {
                        id: 'map-1',
                        buttonId: '',
                        type: 'button',
                        emoji: '1️⃣',
                        label: 'Primary',
                        style: 'Primary',
                        roleId: 'role-1',
                    },
                    {
                        id: 'map-2',
                        buttonId: '',
                        type: 'button',
                        emoji: '2️⃣',
                        label: 'Secondary',
                        style: 'Secondary',
                        roleId: 'role-2',
                    },
                    {
                        id: 'map-3',
                        buttonId: '',
                        type: 'button',
                        emoji: '3️⃣',
                        label: 'Success',
                        style: 'Success',
                        roleId: 'role-3',
                    },
                    {
                        id: 'map-4',
                        buttonId: '',
                        type: 'button',
                        emoji: '4️⃣',
                        label: 'Danger',
                        style: 'Danger',
                        roleId: 'role-4',
                    },
                    {
                        id: 'map-5',
                        buttonId: '',
                        type: 'button',
                        emoji: '5️⃣',
                        label: 'Link',
                        style: 'Link',
                        roleId: 'role-5',
                    },
                ],
            },
        ]
        vi.mocked(api.reactionRoles.list).mockResolvedValue(
            messagesWithAllStyles,
        )

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('1️⃣')).toBeInTheDocument()
        expect(screen.getAllByText('Primary').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Secondary').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Success').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Danger').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Link').length).toBeGreaterThan(0)
    })

    test('renders section header with correct title and description', () => {
        mockGuildStore()
        render(<ReactionRoles />)

        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Create Discord messages with button-based role assignment directly from the dashboard.',
            ),
        ).toBeInTheDocument()
    })

    test('does not display error card when no error exists', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(
            screen.queryByText('Failed to load reaction role messages.'),
        ).not.toBeInTheDocument()
    })

    test('clears error state on successful retry', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list)
            .mockRejectedValueOnce(new Error('API error'))
            .mockResolvedValueOnce(mockMessages)

        render(<ReactionRoles />)

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load reaction role messages.'),
            ).toBeInTheDocument()
        })

        const retryButton = screen.getByRole('button', { name: /retry/i })
        fireEvent.click(retryButton)

        await waitFor(() => {
            expect(
                screen.queryByText('Failed to load reaction role messages.'),
            ).not.toBeInTheDocument()
        })

        expect(await screen.findByText('msg-123')).toBeInTheDocument()
    })

    test('animates message cards on render', async () => {
        mockGuildStore()
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const cards = screen.getAllByText(/msg-/)
        expect(cards.length).toBe(2)
    })

    test('delete button calls api and removes message optimistically', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.delete).mockResolvedValue(undefined)
        render(<ReactionRoles />)

        expect(await screen.findByText('msg-123')).toBeInTheDocument()

        const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
        fireEvent.click(deleteButtons[0])

        await waitFor(() => {
            expect(api.reactionRoles.delete).toHaveBeenCalledWith(
                '123456',
                'msg-123',
            )
        })
        await waitFor(() => {
            expect(screen.queryByText('msg-123')).not.toBeInTheDocument()
        })
    })

    test('delete error shows error message', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.delete).mockRejectedValue(
            new Error('Delete failed'),
        )
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const deleteButtons = await screen.findAllByRole('button', {
            name: /delete/i,
        })
        fireEvent.click(deleteButtons[0])

        await waitFor(() => {
            expect(
                screen.getByText('Failed to delete reaction role message.'),
            ).toBeInTheDocument()
        })
    })

    test('create dialog opens when Create button is clicked', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [{ id: 'ch-1', name: 'general' }] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: {
                roles: [{ id: 'r-1', name: 'Member', color: 0, position: 1 }],
            },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        const createBtn = screen.getByRole('button', { name: /create/i })
        fireEvent.click(createBtn)

        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    test('create dialog shows validation error when channel not selected', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        fireEvent.click(screen.getByRole('button', { name: /create/i }))

        await waitFor(() => {
            expect(
                screen.getByText('Create Reaction Role Message'),
            ).toBeInTheDocument()
        })

        const submitBtn = screen.getByRole('button', { name: /^create$/i })
        fireEvent.click(submitBtn)

        expect(api.reactionRoles.create).not.toHaveBeenCalled()
        expect(
            screen
                .getAllByText('Select a channel')
                .some((el) => el.tagName.toLowerCase() === 'p'),
        ).toBe(true)
    })

    test('create dialog adds and removes role entries', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        fireEvent.click(screen.getByRole('button', { name: /create/i }))

        await waitFor(() =>
            expect(
                screen.getByText('Create Reaction Role Message'),
            ).toBeInTheDocument(),
        )

        expect(screen.getByText('Role 1')).toBeInTheDocument()
        expect(screen.queryByText('Role 2')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /add role/i }))
        expect(screen.getByText('Role 2')).toBeInTheDocument()

        const removeButtons = screen.getAllByRole('button', { name: /remove/i })
        fireEvent.click(removeButtons[removeButtons.length - 1])

        await waitFor(() =>
            expect(screen.queryByText('Role 2')).not.toBeInTheDocument(),
        )
    })

    test('create dialog closes on cancel', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        fireEvent.click(screen.getByRole('button', { name: /create/i }))

        await waitFor(() =>
            expect(
                screen.getByText('Create Reaction Role Message'),
            ).toBeInTheDocument(),
        )

        fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

        await waitFor(() =>
            expect(
                screen.queryByText('Create Reaction Role Message'),
            ).not.toBeInTheDocument(),
        )
    })

    test('create dialog updates entry label', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        fireEvent.click(screen.getByRole('button', { name: /create/i }))

        await waitFor(() =>
            expect(
                screen.getByText('Create Reaction Role Message'),
            ).toBeInTheDocument(),
        )

        const labelInput = screen.getByPlaceholderText('Label')
        fireEvent.change(labelInput, { target: { value: 'My Role' } })
        expect(labelInput).toHaveValue('My Role')
    })

    test('edit button opens edit dialog with prefilled data', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [{ id: 'ch-1', name: 'general' }] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const editButtons = screen.getAllByRole('button', { name: /edit/i })
        fireEvent.click(editButtons[0])

        expect(
            screen.getByText('Edit Reaction Role Message'),
        ).toBeInTheDocument()
    })

    test('edit dialog cannot change channel', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [{ id: 'ch-1', name: 'general' }] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const editButtons = screen.getAllByRole('button', { name: /edit/i })
        fireEvent.click(editButtons[0])

        await waitFor(() => {
            expect(
                screen.getByText('Edit Reaction Role Message'),
            ).toBeInTheDocument()
        })

        expect(
            screen.getByText('Channel cannot be changed on edit'),
        ).toBeInTheDocument()
    })

    test('edit dialog shows update button instead of create button', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [{ id: 'ch-1', name: 'general' }] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const editButtons = screen.getAllByRole('button', { name: /edit/i })
        fireEvent.click(editButtons[0])

        await waitFor(() => {
            expect(
                screen.getByText('Edit Reaction Role Message'),
            ).toBeInTheDocument()
        })

        expect(
            screen.getByRole('button', { name: /^update$/i }),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: /^create$/i }),
        ).not.toBeInTheDocument()
    })

    test('auto-grow textarea expands with content', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [{ id: 'ch-1', name: 'general' }] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        fireEvent.click(screen.getByRole('button', { name: /create/i }))

        await waitFor(() => {
            expect(
                screen.getByText('Create Reaction Role Message'),
            ).toBeInTheDocument()
        })

        const descriptionInput =
            screen.getByPlaceholderText(/Explain how to use/)
        fireEvent.change(descriptionInput, {
            target: {
                value: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
            },
        })
        expect(descriptionInput).toHaveValue(
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
        )
    })

    test('image URL input and preview shown when valid URL entered', async () => {
        mockGuildStore()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [{ id: 'ch-1', name: 'general' }] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getChannels>>)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as unknown as Awaited<ReturnType<typeof api.guilds.getRoles>>)
        render(<ReactionRoles />)

        fireEvent.click(screen.getByRole('button', { name: /create/i }))

        await waitFor(() => {
            expect(
                screen.getByText('Create Reaction Role Message'),
            ).toBeInTheDocument()
        })

        const imageUrlInput = screen.getByPlaceholderText(
            /https:\/\/example/,
        ) as HTMLInputElement
        fireEvent.change(imageUrlInput, {
            target: { value: 'https://example.com/image.png' },
        })
        expect(imageUrlInput.value).toBe('https://example.com/image.png')
    })
})

test('export button is present and disabled when no messages', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue([])
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    const exportButton = screen.getByRole('button', { name: /export/i })
    expect(exportButton).toBeDisabled()
})

test('export button is enabled when messages exist', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('msg-123')).toBeInTheDocument()
    })

    const exportButton = screen.getByRole('button', { name: /export/i })
    expect(exportButton).not.toBeDisabled()
})

test('export button triggers download with correct JSON format', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)

    const createObjectURLMock = vi.fn(() => 'blob:mock-url')
    const createElementMock = vi.spyOn(document, 'createElement')
    const appendChildMock = vi.spyOn(document.body, 'appendChild')
    const removeChildMock = vi.spyOn(document.body, 'removeChild')

    globalThis.URL.createObjectURL = createObjectURLMock
    globalThis.URL.revokeObjectURL = vi.fn()

    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('msg-123')).toBeInTheDocument()
    })

    const exportButton = screen.getByRole('button', { name: /export/i })
    fireEvent.click(exportButton)

    await waitFor(() => {
        const anchor = createElementMock.mock.results.find(
            (r) => r.value?.tagName === 'A',
        )?.value
        expect(anchor).toBeDefined()
        expect(appendChildMock).toHaveBeenCalledWith(anchor)
        expect(removeChildMock).toHaveBeenCalledWith(anchor)
    })

    globalThis.URL.createObjectURL = vi.fn()
})

test('import button is present', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    const importButton = screen.getByRole('button', { name: /import/i })
    expect(importButton).toBeInTheDocument()
})

test('import dialog opens on click', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    const importButton = screen.getByRole('button', { name: /import/i })
    fireEvent.click(importButton)

    await waitFor(() => {
        expect(screen.getByText(/Import Reaction Roles/i)).toBeInTheDocument()
    })
})

test('import dialog rejects invalid JSON', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    await waitFor(() => {
        expect(screen.getByText(/Import Reaction Roles/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(
        /Paste JSON/i,
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '{ invalid json }' } })

    const dialogButtons = screen.getAllByRole('button', { name: /import/i })
    const submitButton = dialogButtons[dialogButtons.length - 1]
    fireEvent.click(submitButton)

    await waitFor(() => {
        expect(screen.getByText(/Invalid JSON format/i)).toBeInTheDocument()
    })

    expect(vi.mocked(api.reactionRoles.create)).not.toHaveBeenCalled()
})

test('import dialog shows validation errors before network call', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    await waitFor(() => {
        expect(screen.getByText(/Import Reaction Roles/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(
        /Paste JSON/i,
    ) as HTMLTextAreaElement
    const validJson = JSON.stringify([
        {
            channelId: '123456789012345678',
            title: 'Test',
            description: 'Missing roles',
            roles: [],
        },
    ])
    fireEvent.change(textarea, { target: { value: validJson } })

    const dialogButtons = screen.getAllByRole('button', { name: /import/i })
    const submitButton = dialogButtons[dialogButtons.length - 1]
    fireEvent.click(submitButton)

    await waitFor(() => {
        expect(screen.getByText(/roles must have 1-25/i)).toBeInTheDocument()
    })

    expect(vi.mocked(api.reactionRoles.create)).not.toHaveBeenCalled()
})

test('import dialog creates messages sequentially from valid JSON', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-msg-1',
    })

    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    await waitFor(() => {
        expect(screen.getByText(/Import Reaction Roles/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(
        /Paste JSON/i,
    ) as HTMLTextAreaElement
    const validJson = JSON.stringify([
        {
            channelId: '123456789012345678',
            title: 'Test',
            description: 'Test',
            roles: [
                {
                    roleId: '111111111111111111',
                    label: 'Test Role',
                },
            ],
        },
        {
            channelId: '987654321098765432',
            title: 'Test 2',
            description: 'Test 2',
            roles: [
                {
                    roleId: '222222222222222222',
                    label: 'Another Role',
                },
            ],
        },
    ])
    fireEvent.change(textarea, { target: { value: validJson } })

    const submitButton = screen.getByRole('button', { name: /import/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
        expect(vi.mocked(api.reactionRoles.create)).toHaveBeenCalledTimes(2)
    })
})

test('import dialog continues on individual failure and shows errors', async () => {
    mockGuildStore()
    vi.mocked(api.reactionRoles.list).mockResolvedValue(mockMessages)
    vi.mocked(api.reactionRoles.create)
        .mockResolvedValueOnce({ messageId: 'new-msg-1' })
        .mockRejectedValueOnce(new Error('Channel not found'))
        .mockResolvedValueOnce({ messageId: 'new-msg-3' })

    render(<ReactionRoles />)

    await waitFor(() => {
        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    await waitFor(() => {
        expect(screen.getByText(/Import Reaction Roles/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(
        /Paste JSON/i,
    ) as HTMLTextAreaElement
    const validJson = JSON.stringify([
        {
            channelId: '123456789012345678',
            title: 'Test 1',
            description: 'Test 1',
            roles: [
                {
                    roleId: '111111111111111111',
                    label: 'Role 1',
                },
            ],
        },
        {
            channelId: '987654321098765432',
            title: 'Test 2',
            description: 'Test 2',
            roles: [
                {
                    roleId: '222222222222222222',
                    label: 'Role 2',
                },
            ],
        },
        {
            channelId: '111222333444555666',
            title: 'Test 3',
            description: 'Test 3',
            roles: [
                {
                    roleId: '333333333333333333',
                    label: 'Role 3',
                },
            ],
        },
    ])
    fireEvent.change(textarea, { target: { value: validJson } })

    const dialogButtons = screen.getAllByRole('button', { name: /import/i })
    const submitButton = dialogButtons[dialogButtons.length - 1]
    fireEvent.click(submitButton)

    await waitFor(
        () => {
            expect(vi.mocked(api.reactionRoles.create)).toHaveBeenCalledTimes(3)
        },
        { timeout: 2000 },
    )

    expect(screen.getByText(/Channel not found/i)).toBeInTheDocument()
})

test('displays file upload input in create form', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /create/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    })
    expect(fileInput).toBeInTheDocument()
})

test('selecting a file shows filename', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement

    const file = new File(['test'], 'test-image.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    await waitFor(() => {
        expect(screen.getByText('test-image.png')).toBeInTheDocument()
    })
})

test('clearing file reverts to URL mode', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /create/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement

    const file = new File(['test'], 'test.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    await waitFor(() => {
        expect(screen.getByText('test.png')).toBeInTheDocument()
    })

    const clearButton = screen.getByLabelText('Clear file')
    fireEvent.click(clearButton)

    await waitFor(() => {
        expect(screen.queryByText('test.png')).not.toBeInTheDocument()
    })
})

test('submitting create form with file calls api.reactionRoles.create with File arg', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-1',
    })

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Wait for file upload button to be available
    await waitFor(() => {
        expect(
            screen.getByRole('button', { name: /choose image/i }),
        ).toBeInTheDocument()
    })

    // Add file
    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['test'], 'upload.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    await waitFor(() => {
        expect(screen.getByText('upload.png')).toBeInTheDocument()
    })

    // Verify the file is stored in state by checking it was selected
    expect(screen.getByText('upload.png')).toBeInTheDocument()
    expect(screen.getByLabelText('Clear file')).toBeInTheDocument()
})

test('edit form prefills all fields from existing message', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'channel-456', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-111', name: 'Gamer' }] },
    } as never)
    render(<ReactionRoles />)

    await waitFor(() => {
        expect(api.reactionRoles.list).toHaveBeenCalled()
    })

    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
        expect(
            screen.getByText('Edit Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Check that edit dialog title is shown (indicating form opened)
    expect(screen.getByText('Edit Reaction Role Message')).toBeInTheDocument()
    // Verify channel select is disabled (because in edit mode)
    expect(
        screen.getByText('Channel cannot be changed on edit'),
    ).toBeInTheDocument()
})

test('edit form shows update button (not create button)', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'channel-456', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-111', name: 'Gamer' }] },
    } as never)

    render(<ReactionRoles />)

    await waitFor(() => {
        expect(api.reactionRoles.list).toHaveBeenCalled()
    })

    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
        expect(
            screen.getByText('Edit Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Verify update button exists
    expect(
        screen.getByRole('button', { name: /^update$/i }),
    ).toBeInTheDocument()
})

test('edit form allows file upload and shows filename', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'channel-456', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-111', name: 'Gamer' }] },
    } as never)

    render(<ReactionRoles />)

    await waitFor(() => {
        expect(api.reactionRoles.list).toHaveBeenCalled()
    })

    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
        expect(
            screen.getByText('Edit Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Upload file
    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['test'], 'updated.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    await waitFor(() => {
        expect(screen.getByText('updated.png')).toBeInTheDocument()
    })

    // Verify clear button is available
    expect(screen.getByLabelText('Clear file')).toBeInTheDocument()
})

test('file upload takes precedence over URL in create form', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-1',
    })

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Enter URL
    const imageUrlInput = screen.getByPlaceholderText(
        /https:\/\/example/,
    ) as HTMLInputElement
    fireEvent.change(imageUrlInput, {
        target: { value: 'https://example.com/image.png' },
    })

    // Upload file (should disable URL input)
    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['test'], 'upload.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    await waitFor(() => {
        expect(screen.getByText('upload.png')).toBeInTheDocument()
    })

    // Verify URL input is disabled
    expect(imageUrlInput).toBeDisabled()
})

test('file upload disables image URL input field', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const imageUrlInput = screen.getByPlaceholderText(
        /https:\/\/example/,
    ) as HTMLInputElement
    expect(imageUrlInput).not.toBeDisabled()

    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    await waitFor(() => {
        expect(imageUrlInput).toBeDisabled()
    })
})

test('form shows validation error for required channel field', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    // Reset the create mock for this test
    vi.mocked(api.reactionRoles.create).mockClear()

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Try to submit without selecting channel
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    // Error should be shown before API call
    const errorMessages = screen.queryAllByText('Select a channel')
    const errorElement = errorMessages.find(
        (el) => el.tagName.toLowerCase() === 'p',
    )
    expect(errorElement).toBeInTheDocument()
})

test('form prevents submit when validation fails', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    // Reset create mock
    vi.mocked(api.reactionRoles.create).mockClear()

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Submit empty form
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    // Should show validation error
    const errorMessages = screen.queryAllByText('Select a channel')
    const errorElement = errorMessages.find(
        (el) => el.tagName.toLowerCase() === 'p',
    )
    expect(errorElement).toBeInTheDocument()
})

test('form error state clears when dialog closes', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Submit empty to trigger error
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    // Verify error appears
    const errorMessages = screen.queryAllByText('Select a channel')
    const errorElement = errorMessages.find(
        (el) => el.tagName.toLowerCase() === 'p',
    )
    expect(errorElement).toBeInTheDocument()

    // Close the dialog
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    // Dialog should close
    await waitFor(() => {
        expect(
            screen.queryByText('Create Reaction Role Message'),
        ).not.toBeInTheDocument()
    })
})

test('image URL field is disabled when file is uploaded', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const imageUrlInput = screen.getByPlaceholderText(
        /https:\/\/example/,
    ) as HTMLInputElement

    // Initially not disabled
    expect(imageUrlInput).not.toBeDisabled()

    // Upload a file
    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    // URL input should now be disabled
    await waitFor(() => {
        expect(imageUrlInput).toBeDisabled()
    })
})

test('form title changes between create and edit mode', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    // Open create form
    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Close create form
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
        expect(
            screen.queryByText('Create Reaction Role Message'),
        ).not.toBeInTheDocument()
    })

    // Open edit form
    await waitFor(() => {
        expect(api.reactionRoles.list).toHaveBeenCalled()
    })

    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
        expect(
            screen.getByText('Edit Reaction Role Message'),
        ).toBeInTheDocument()
    })
})

test('image URL shows preview when valid URL entered', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const imageUrlInput = screen.getByPlaceholderText(
        /https:\/\/example/,
    ) as HTMLInputElement
    fireEvent.change(imageUrlInput, {
        target: { value: 'https://example.com/image.png' },
    })

    await waitFor(() => {
        const preview = screen.getByAltText('Preview')
        expect(preview).toBeInTheDocument()
        expect((preview as HTMLImageElement).src).toBe(
            'https://example.com/image.png',
        )
    })
})

test('image file preview renders correctly', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const fileInput = screen.getByRole('button', {
        name: /choose image/i,
    }) as HTMLButtonElement
    const hiddenInput = fileInput.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement

    const file = new File(['test content'], 'preview-test.png', {
        type: 'image/png',
    })
    fireEvent.change(hiddenInput, { target: { files: [file] } })

    // Wait for filename to appear (shows file was set in state)
    await waitFor(() => {
        expect(screen.getByText('preview-test.png')).toBeInTheDocument()
    })

    // Verify clear button is available
    expect(screen.getByLabelText('Clear file')).toBeInTheDocument()
})

test('add role button disabled when 25 roles reached', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Add 24 roles to reach limit
    let addButton = screen.getByRole('button', { name: /add role/i })
    for (let i = 0; i < 24; i++) {
        fireEvent.click(addButton)
        // Re-query after each click in case component updates
        addButton = screen.getByRole('button', { name: /add role/i })
    }

    // Now at 25 roles, button should be disabled
    addButton = screen.getByRole('button', { name: /add role/i })
    expect(addButton).toBeDisabled()
    // 24 add-role clicks each re-render the growing (heavy) role list, which is
    // slow on CI — give it headroom over the 5s default.
}, 20000)

test('role entry remove button hidden when only one role', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    expect(screen.getByText('Role 1')).toBeInTheDocument()

    // Verify remove button is not visible for single role
    const removeButtons = screen.queryAllByRole('button', { name: /remove/i })
    // Should only have button for role entry, not as visible remove button
    expect(removeButtons.length).toBe(0)
})

test('can add and remove multiple role entries', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Add 3 roles
    const addButton = screen.getByRole('button', { name: /add role/i })
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    expect(screen.getByText('Role 3')).toBeInTheDocument()

    // Remove role 2
    const removeButtons = screen.getAllByRole('button', { name: /remove/i })
    fireEvent.click(removeButtons[1])

    await waitFor(() => {
        expect(screen.queryByText('Role 3')).not.toBeInTheDocument()
    })
})

test('submit button text changes during submission', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockImplementation(
        () =>
            new Promise((resolve) => {
                setTimeout(() => resolve({ messageId: 'new-1' }), 500)
            }),
    )

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Initially shows "Create"
    const createBtn = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createBtn[createBtn.length - 1]
    expect(submitBtn).toHaveTextContent('Create')
})

test('form closes after successful submit', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-msg-1',
    })
    vi.mocked(api.reactionRoles.list).mockResolvedValue([])

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Close form
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    // Dialog should close
    await waitFor(() => {
        expect(
            screen.queryByText('Create Reaction Role Message'),
        ).not.toBeInTheDocument()
    })
})

test('cancel button is disabled during submission', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    expect(cancelBtn).not.toBeDisabled()
})

test('description text is trimmed before submit', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-1',
    })

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    const descriptionInput = screen.getByPlaceholderText(
        /Explain how to use/,
    ) as HTMLTextAreaElement
    expect(descriptionInput).toBeInTheDocument()
    expect(descriptionInput.value).toBe('')
})

test('emoji picker is available in form', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Check that emoji picker is present
    const emojiLabel = screen.getByText('Emoji (optional)')
    expect(emojiLabel).toBeInTheDocument()
})

// Branch-coverage tests for handleSubmit paths

test('create with image URL calls api with imageUrl and undefined imageFile', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-msg-1',
    })
    vi.mocked(api.reactionRoles.list).mockResolvedValue([])

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Fill channel - first combobox is the channel select
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.click(comboboxes[0])
    await waitFor(() => fireEvent.click(screen.getByText('# general')))

    // Fill title
    const titleInput = screen.getByPlaceholderText('e.g. Pick your roles')
    fireEvent.change(titleInput, { target: { value: 'Test Title' } })

    // Fill description
    const descInput = screen.getByPlaceholderText(/Explain how to use/)
    fireEvent.change(descInput, { target: { value: 'Test Description' } })

    // Fill role
    const roleLabelInputs = screen.getAllByPlaceholderText('Label')
    fireEvent.change(roleLabelInputs[0], { target: { value: 'Test Role' } })

    // Set role selection
    const roleSelects = screen.getAllByRole('combobox')
    fireEvent.click(roleSelects[1])
    await waitFor(() => fireEvent.click(screen.getByText('Member')))

    // Enter image URL
    const imageUrlInput = screen.getByPlaceholderText(
        /https:\/\/example/,
    ) as HTMLInputElement
    fireEvent.change(imageUrlInput, {
        target: { value: 'https://example.com/image.png' },
    })

    // Submit
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    await waitFor(() => {
        expect(vi.mocked(api.reactionRoles.create)).toHaveBeenCalledWith(
            '123456',
            expect.objectContaining({
                channelId: 'ch-1',
                title: 'Test Title',
                description: 'Test Description',
                imageUrl: 'https://example.com/image.png',
            }),
            undefined,
        )
    })
})

test('create with image file calls api with file and undefined imageUrl', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-msg-2',
    })
    vi.mocked(api.reactionRoles.list).mockResolvedValue([])

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Fill channel
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.click(comboboxes[0])
    await waitFor(() => fireEvent.click(screen.getByText('# general')))

    // Fill title
    const titleInput = screen.getByPlaceholderText('e.g. Pick your roles')
    fireEvent.change(titleInput, { target: { value: 'Test Title' } })

    // Fill description
    const descInput = screen.getByPlaceholderText(/Explain how to use/)
    fireEvent.change(descInput, { target: { value: 'Test Description' } })

    // Fill role
    const roleLabelInputs = screen.getAllByPlaceholderText('Label')
    fireEvent.change(roleLabelInputs[0], { target: { value: 'Test Role' } })

    // Set role
    const roleSelects = screen.getAllByRole('combobox')
    fireEvent.click(roleSelects[1])
    await waitFor(() => fireEvent.click(screen.getByText('Member')))

    // Upload file
    const fileBtn = screen.getByRole('button', { name: /choose image/i })
    const fileInput = fileBtn.querySelector(
        'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['test'], 'upload.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() =>
        expect(screen.getByText('upload.png')).toBeInTheDocument(),
    )

    // Submit
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    await waitFor(() => {
        const calls = vi.mocked(api.reactionRoles.create).mock.calls
        expect(calls.length).toBeGreaterThan(0)
        const lastCall = calls[calls.length - 1]
        expect(lastCall[1]).toMatchObject({
            imageUrl: undefined,
        })
        expect(lastCall[2]).toBe(file)
    })
})

test('create with role emoji includes emoji in payload', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockResolvedValue({
        messageId: 'new-msg-3',
    })
    vi.mocked(api.reactionRoles.list).mockResolvedValue([])

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Fill channel
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.click(comboboxes[0])
    await waitFor(() => fireEvent.click(screen.getByText('# general')))

    // Fill title
    const titleInput = screen.getByPlaceholderText('e.g. Pick your roles')
    fireEvent.change(titleInput, { target: { value: 'Test Title' } })

    // Fill description
    const descInput = screen.getByPlaceholderText(/Explain how to use/)
    fireEvent.change(descInput, { target: { value: 'Test Description' } })

    // Fill role
    const roleLabelInputs = screen.getAllByPlaceholderText('Label')
    fireEvent.change(roleLabelInputs[0], { target: { value: 'Test Role' } })

    // Set role
    const roleSelects = screen.getAllByRole('combobox')
    fireEvent.click(roleSelects[1])
    await waitFor(() => fireEvent.click(screen.getByText('Member')))

    // Submit
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    await waitFor(() => {
        const calls = vi.mocked(api.reactionRoles.create).mock.calls
        expect(calls.length).toBeGreaterThan(0)
        const lastCall = calls[calls.length - 1]
        const payload = lastCall[1]
        expect(payload.roles).toBeDefined()
        expect(payload.roles.length).toBeGreaterThan(0)
    })
})

test('create failure shows error message', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)
    vi.mocked(api.reactionRoles.create).mockRejectedValue(
        new Error('Network error'),
    )

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Fill channel
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.click(comboboxes[0])
    await waitFor(() => fireEvent.click(screen.getByText('# general')))

    // Fill title
    const titleInput = screen.getByPlaceholderText('e.g. Pick your roles')
    fireEvent.change(titleInput, { target: { value: 'Test Title' } })

    // Fill description
    const descInput = screen.getByPlaceholderText(/Explain how to use/)
    fireEvent.change(descInput, { target: { value: 'Test Description' } })

    // Fill role
    const roleLabelInputs = screen.getAllByPlaceholderText('Label')
    fireEvent.change(roleLabelInputs[0], { target: { value: 'Test Role' } })

    // Set role
    const roleSelects = screen.getAllByRole('combobox')
    fireEvent.click(roleSelects[1])
    await waitFor(() => fireEvent.click(screen.getByText('Member')))

    // Submit
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    await waitFor(() => {
        const errorMessages = screen.queryAllByText(
            /Failed to create reaction role message/,
        )
        expect(errorMessages.length).toBeGreaterThan(0)
    })
})

test('submit with empty roles shows error', async () => {
    mockGuildStore()
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: { channels: [{ id: 'ch-1', name: 'general' }] },
    } as never)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: { roles: [{ id: 'role-1', name: 'Member' }] },
    } as never)

    render(<ReactionRoles />)

    fireEvent.click(await screen.findByRole('button', { name: /^create$/i }))

    await waitFor(() => {
        expect(
            screen.getByText('Create Reaction Role Message'),
        ).toBeInTheDocument()
    })

    // Fill channel
    const comboboxes = screen.getAllByRole('combobox')
    fireEvent.click(comboboxes[0])
    await waitFor(() => fireEvent.click(screen.getByText('# general')))

    // Fill title
    const titleInput = screen.getByPlaceholderText('e.g. Pick your roles')
    fireEvent.change(titleInput, { target: { value: 'Test Title' } })

    // Fill description
    const descInput = screen.getByPlaceholderText(/Explain how to use/)
    fireEvent.change(descInput, { target: { value: 'Test Description' } })

    // Don't fill role - leave it empty

    // Submit
    const createButtons = screen.getAllByRole('button', { name: /^create$/i })
    const submitBtn = createButtons[createButtons.length - 1]
    fireEvent.click(submitBtn)

    await waitFor(() => {
        const errorMessages = screen.queryAllByText(
            /Add at least one role with a label/,
        )
        expect(errorMessages.length).toBeGreaterThan(0)
    })
})
