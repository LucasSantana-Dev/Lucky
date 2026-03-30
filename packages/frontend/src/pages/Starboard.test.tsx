import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Starboard from './Starboard'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import type { StarboardConfig, StarboardEntry } from '@/services/starboardApi'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api')
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockGuild = {
    id: '123456',
    name: 'Test Guild',
    icon: null,
    memberCount: 100,
}

const mockEntries: StarboardEntry[] = [
    {
        id: '1',
        guildId: '123456',
        messageId: 'msg-1',
        channelId: 'channel-1',
        authorId: 'user-1',
        content: 'This is a great message!',
        starCount: 15,
        createdAt: new Date('2024-01-15').toISOString(),
    },
    {
        id: '2',
        guildId: '123456',
        messageId: 'msg-2',
        channelId: 'channel-2',
        authorId: 'user-2',
        content: 'Another starred message',
        starCount: 8,
        createdAt: new Date('2024-01-20').toISOString(),
    },
]

const mockConfig: StarboardConfig = {
    guildId: '123456',
    channelId: '999',
    emoji: '⭐',
    threshold: 3,
    selfStar: false,
}

function mockGuildStore(selectedGuild = mockGuild) {
    vi.mocked(useGuildStore).mockReturnValue({
        selectedGuild,
    } as ReturnType<typeof useGuildStore>)
}

describe('Starboard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.starboard.getConfig).mockResolvedValue(mockConfig)
        vi.mocked(api.starboard.getTopEntries).mockResolvedValue(mockEntries)
    })

    test('renders empty state when no guild is selected', () => {
        mockGuildStore(null)
        render(<Starboard />)
        expect(screen.getByText('No server selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to view starboard settings'),
        ).toBeInTheDocument()
    })

    test('renders loading skeletons initially', () => {
        mockGuildStore()
        const { container } = render(<Starboard />)
        const skeletons = container.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('loads and displays starboard entries', async () => {
        mockGuildStore()
        render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getTopEntries).toHaveBeenCalledWith(
                '123456',
                20,
            )
        })

        expect(
            await screen.findByText('This is a great message!'),
        ).toBeInTheDocument()
        expect(screen.getByText('Another starred message')).toBeInTheDocument()
        expect(screen.getByText('15')).toBeInTheDocument()
        expect(screen.getByText('8')).toBeInTheDocument()
    })

    test('displays empty state when no entries exist', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.getTopEntries).mockResolvedValue([])
        render(<Starboard />)

        expect(
            await screen.findByText('No starred messages yet'),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Configure the starboard below and members can start starring messages',
            ),
        ).toBeInTheDocument()
    })

    test('loads and displays config settings', async () => {
        mockGuildStore()
        const { container } = render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalledWith('123456')
        })

        const channelInput = screen.getByPlaceholderText(
            'Channel ID',
        ) as HTMLInputElement
        expect(channelInput.value).toBe('999')

        const emojiInput = screen.getByPlaceholderText('⭐') as HTMLInputElement
        expect(emojiInput.value).toBe('⭐')

        const thresholdInput = container.querySelector(
            'input[type="number"][max="100"]',
        ) as HTMLInputElement
        expect(Number(thresholdInput.value)).toBe(3)

        const selfStarSwitch = screen.getByRole('switch', {
            name: /allow self-star/i,
        })
        expect(selfStarSwitch).not.toBeChecked()
    })

    test('displays active badge when config exists', async () => {
        mockGuildStore()
        render(<Starboard />)

        expect(await screen.findByText('Active')).toBeInTheDocument()
    })

    test('does not display active badge when no config exists', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.getConfig).mockResolvedValue(null)
        render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalled()
        })

        expect(screen.queryByText('Active')).not.toBeInTheDocument()
    })

    test('handles config save successfully', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.updateConfig).mockResolvedValue(mockConfig)
        const { toast } = await import('sonner')

        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /save/i }),
            ).toBeInTheDocument()
        })

        const saveButton = screen.getByRole('button', { name: /save/i })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(api.starboard.updateConfig).toHaveBeenCalledWith('123456', {
                channelId: '999',
                emoji: '⭐',
                threshold: 3,
                selfStar: false,
            })
        })

        expect(toast.success).toHaveBeenCalledWith('Starboard settings saved')
    })

    test('handles config save failure', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.updateConfig).mockRejectedValue(
            new Error('API error'),
        )
        const { toast } = await import('sonner')

        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /save/i }),
            ).toBeInTheDocument()
        })

        const saveButton = screen.getByRole('button', { name: /save/i })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to save settings')
        })
    })

    test('toggles self-star switch', async () => {
        mockGuildStore()
        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('switch', { name: /allow self-star/i }),
            ).toBeInTheDocument()
        })

        const selfStarSwitch = screen.getByRole('switch', {
            name: /allow self-star/i,
        })
        expect(selfStarSwitch).not.toBeChecked()

        fireEvent.click(selfStarSwitch)
        expect(selfStarSwitch).toBeChecked()
    })

    test('updates channel ID input', async () => {
        mockGuildStore()
        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByPlaceholderText('Channel ID'),
            ).toBeInTheDocument()
        })

        const channelInput = screen.getByPlaceholderText(
            'Channel ID',
        ) as HTMLInputElement
        fireEvent.change(channelInput, { target: { value: '888' } })

        expect(channelInput.value).toBe('888')
    })

    test('updates emoji input', async () => {
        mockGuildStore()
        render(<Starboard />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('⭐')).toBeInTheDocument()
        })

        const emojiInput = screen.getByPlaceholderText('⭐') as HTMLInputElement
        fireEvent.change(emojiInput, { target: { value: '🌟' } })

        expect(emojiInput.value).toBe('🌟')
    })

    test('updates threshold input', async () => {
        mockGuildStore()
        const { container } = render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalled()
        })

        const thresholdInput = container.querySelector(
            'input[type="number"][max="100"]',
        ) as HTMLInputElement
        fireEvent.change(thresholdInput, { target: { value: '5' } })

        expect(thresholdInput.value).toBe('5')
    })

    test('deletes starboard config successfully', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.deleteConfig).mockResolvedValue(
            undefined as never,
        )
        const { toast } = await import('sonner')

        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /disable starboard/i }),
            ).toBeInTheDocument()
        })

        const deleteButton = screen.getByRole('button', {
            name: /disable starboard/i,
        })
        fireEvent.click(deleteButton)

        await waitFor(() => {
            expect(api.starboard.deleteConfig).toHaveBeenCalledWith('123456')
        })

        expect(toast.success).toHaveBeenCalledWith('Starboard disabled')
    })

    test('handles delete config failure', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.deleteConfig).mockRejectedValue(
            new Error('API error'),
        )
        const { toast } = await import('sonner')

        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /disable starboard/i }),
            ).toBeInTheDocument()
        })

        const deleteButton = screen.getByRole('button', {
            name: /disable starboard/i,
        })
        fireEvent.click(deleteButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to delete starboard config',
            )
        })
    })

    test('does not show disable button when no config exists', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.getConfig).mockResolvedValue(null)
        render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalled()
        })

        expect(
            screen.queryByRole('button', { name: /disable starboard/i }),
        ).not.toBeInTheDocument()
    })

    test('handles API error when loading data', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.getConfig).mockRejectedValue(
            new ApiError('Server error', 500),
        )
        const { toast } = await import('sonner')

        render(<Starboard />)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to load starboard settings',
            )
        })
    })

    test('ignores 404 errors when loading config', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.getConfig).mockResolvedValue(null)
        vi.mocked(api.starboard.getTopEntries).mockResolvedValue([])
        const { toast } = await import('sonner')

        render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalled()
        })

        expect(toast.error).not.toHaveBeenCalled()
    })

    test('displays entry without content', async () => {
        mockGuildStore()
        const entriesWithoutContent: StarboardEntry[] = [
            {
                id: '1',
                guildId: '123456',
                messageId: 'msg-1',
                channelId: 'channel-1',
                authorId: 'user-1',
                content: null,
                starCount: 10,
                createdAt: new Date('2024-01-15').toISOString(),
            },
        ]
        vi.mocked(api.starboard.getTopEntries).mockResolvedValue(
            entriesWithoutContent,
        )

        render(<Starboard />)

        await waitFor(() => {
            expect(screen.getByText('10')).toBeInTheDocument()
        })

        expect(
            screen.queryByText('This is a great message!'),
        ).not.toBeInTheDocument()
    })

    test('formats entry dates correctly', async () => {
        mockGuildStore()
        render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getTopEntries).toHaveBeenCalled()
        })

        const dateElements = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/)
        expect(dateElements.length).toBeGreaterThan(0)
    })

    test('shows saving state on save button', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.updateConfig).mockImplementation(
            () => new Promise(() => {}),
        )

        render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /save/i }),
            ).toBeInTheDocument()
        })

        const saveButton = screen.getByRole('button', { name: /save/i })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(saveButton).toBeDisabled()
        })
    })

    test('defaults to ⭐ emoji when config has no emoji', async () => {
        mockGuildStore()
        const configWithoutEmoji: StarboardConfig = {
            ...mockConfig,
            emoji: '',
        }
        vi.mocked(api.starboard.getConfig).mockResolvedValue(configWithoutEmoji)

        render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalled()
        })

        const emojiInput = screen.getByPlaceholderText('⭐') as HTMLInputElement
        expect(emojiInput.value).toBe('⭐')
    })

    test('defaults to 3 threshold when saving with empty value', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.updateConfig).mockResolvedValue(mockConfig)

        const { container } = render(<Starboard />)

        await waitFor(() => {
            expect(api.starboard.getConfig).toHaveBeenCalled()
        })

        const thresholdInput = container.querySelector(
            'input[type="number"][max="100"]',
        ) as HTMLInputElement
        fireEvent.change(thresholdInput, { target: { value: '' } })

        const saveButton = screen.getByRole('button', { name: /save/i })
        fireEvent.click(saveButton)

        await waitFor(() => {
            expect(api.starboard.updateConfig).toHaveBeenCalledWith(
                '123456',
                expect.objectContaining({
                    threshold: 3,
                }),
            )
        })
    })

    test('resets form after successful delete', async () => {
        mockGuildStore()
        vi.mocked(api.starboard.deleteConfig).mockResolvedValue(
            undefined as never,
        )

        const { container } = render(<Starboard />)

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /disable starboard/i }),
            ).toBeInTheDocument()
        })

        const deleteButton = screen.getByRole('button', {
            name: /disable starboard/i,
        })
        fireEvent.click(deleteButton)

        await waitFor(() => {
            expect(api.starboard.deleteConfig).toHaveBeenCalled()
        })

        const channelInput = screen.getByPlaceholderText(
            'Channel ID',
        ) as HTMLInputElement
        expect(channelInput.value).toBe('')

        const emojiInput = screen.getByPlaceholderText('⭐') as HTMLInputElement
        expect(emojiInput.value).toBe('⭐')

        const thresholdInput = container.querySelector(
            'input[type="number"][max="100"]',
        ) as HTMLInputElement
        expect(Number(thresholdInput.value)).toBe(3)

        const selfStarSwitch = screen.getByRole('switch', {
            name: /allow self-star/i,
        })
        expect(selfStarSwitch).not.toBeChecked()
    })
})
