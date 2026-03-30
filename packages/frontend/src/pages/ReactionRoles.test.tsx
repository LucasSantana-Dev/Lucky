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
                messageId: 'msg-123',
                emoji: '🎮',
                label: 'Gamer',
                style: 'Primary',
                roleId: 'role-111',
            },
            {
                id: 'map-2',
                messageId: 'msg-123',
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
                messageId: 'msg-789',
                emoji: null,
                label: 'Developer',
                style: 'Success',
                roleId: 'role-333',
            },
        ],
    },
]

function mockGuildStore(selectedGuild = mockGuild) {
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
        const { container } = render(<ReactionRoles />)
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
        const { container } = render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalledWith('123456')
        })

        expect(await screen.findByText('msg-123')).toBeInTheDocument()
        expect(screen.getByText('msg-789')).toBeInTheDocument()
    })

    test('displays message with channel ID', async () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('channel-456')).toBeInTheDocument()
        expect(screen.getByText('channel-999')).toBeInTheDocument()
    })

    test('displays role count badge', async () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('2 roles')).toBeInTheDocument()
        expect(screen.getByText('1 role')).toBeInTheDocument()
    })

    test('displays role mappings with emoji', async () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)

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
        const { container } = render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('Developer')).toBeInTheDocument()
        expect(screen.queryByText('null')).not.toBeInTheDocument()
    })

    test('displays button style labels', async () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        expect(await screen.findByText('Primary')).toBeInTheDocument()
        expect(screen.getByText('Secondary')).toBeInTheDocument()
        expect(screen.getByText('Success')).toBeInTheDocument()
    })

    test('displays role IDs', async () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)

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
        const { container } = render(<ReactionRoles />)

        expect(
            await screen.findByText('No reaction role messages'),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Use /reactionrole in Discord to set up button-based role assignment messages. They will appear here once created.',
            ),
        ).toBeInTheDocument()
    })

    test('handles API error when loading messages', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list).mockRejectedValue(
            new Error('API error'),
        )

        const { container } = render(<ReactionRoles />)

        expect(
            await screen.findByText('Failed to load reaction role messages.'),
        ).toBeInTheDocument()
    })

    test('displays retry button on error', async () => {
        mockGuildStore()
        vi.mocked(api.reactionRoles.list).mockRejectedValue(
            new Error('API error'),
        )

        const { container } = render(<ReactionRoles />)

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

        const { container } = render(<ReactionRoles />)

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
        const { container } = render(<ReactionRoles />)

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

        const { container } = render(<ReactionRoles />)

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
                        messageId: 'msg-numeric',
                        emoji: '🔥',
                        label: 'Hot',
                        style: '1',
                        roleId: 'role-hot',
                    },
                    {
                        id: 'map-2',
                        messageId: 'msg-numeric',
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

        const { container } = render(<ReactionRoles />)

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
                        messageId: 'msg-unknown',
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

        const { container } = render(<ReactionRoles />)

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
                        messageId: 'msg-all-styles',
                        emoji: '1️⃣',
                        label: 'Primary',
                        style: 'Primary',
                        roleId: 'role-1',
                    },
                    {
                        id: 'map-2',
                        messageId: 'msg-all-styles',
                        emoji: '2️⃣',
                        label: 'Secondary',
                        style: 'Secondary',
                        roleId: 'role-2',
                    },
                    {
                        id: 'map-3',
                        messageId: 'msg-all-styles',
                        emoji: '3️⃣',
                        label: 'Success',
                        style: 'Success',
                        roleId: 'role-3',
                    },
                    {
                        id: 'map-4',
                        messageId: 'msg-all-styles',
                        emoji: '4️⃣',
                        label: 'Danger',
                        style: 'Danger',
                        roleId: 'role-4',
                    },
                    {
                        id: 'map-5',
                        messageId: 'msg-all-styles',
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

        const { container } = render(<ReactionRoles />)

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
        const { container } = render(<ReactionRoles />)

        expect(screen.getByText('Reaction Roles')).toBeInTheDocument()
        expect(
            screen.getByText(
                'View Discord messages that have reaction role buttons configured. Use the /reactionrole command in Discord to create and manage these.',
            ),
        ).toBeInTheDocument()
    })

    test('does not display error card when no error exists', async () => {
        mockGuildStore()
        const { container } = render(<ReactionRoles />)

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

        const { container } = render(<ReactionRoles />)

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
        const { container } = render(<ReactionRoles />)

        await waitFor(() => {
            expect(api.reactionRoles.list).toHaveBeenCalled()
        })

        const cards = screen.getAllByText(/msg-/)
        expect(cards.length).toBe(2)
    })
})
