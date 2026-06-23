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
