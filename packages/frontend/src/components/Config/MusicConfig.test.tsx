import { describe, test, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import MusicConfig from './MusicConfig'
import { api } from '@/services/api'
import { toast } from 'sonner'

vi.mock('@/services/api', () => ({
    api: {
        modules: {
            getSettings: vi.fn(),
            updateSettings: vi.fn(),
        },
    },
}))

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock('@/hooks/useGuildSelection', () => ({
    useGuildSelection: () => ({
        selectedGuild: {
            id: '123456789',
            name: 'Test Server',
            icon: null,
            owner: true,
            permissions: '8',
            features: [],
            botAdded: true,
        },
    }),
}))

describe('MusicConfig', () => {
    const mockGuildId = '123456789'

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders music configuration form', () => {
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: null },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        expect(screen.getByText('Music Configuration')).toBeInTheDocument()
        expect(screen.getByLabelText(/volume/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/autoplay/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/shuffle/i)).toBeInTheDocument()
    })

    test('loads existing settings on mount', async () => {
        // API returns GuildSettings column names (#2637)
        const mockSettings = {
            defaultVolume: 75,
            autoPlayEnabled: true,
            repeatMode: 2,
            shuffleEnabled: true,
        }

        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('75%')).toBeInTheDocument()
        })
        expect(screen.getByLabelText(/toggle autoplay/i)).toBeChecked()
    })

    test('volume slider displays current value', async () => {
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: { defaultVolume: 75 } },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('75%')).toBeInTheDocument()
        })

        const volumeSlider = screen.getByLabelText(/volume level/i)
        expect(volumeSlider).toHaveAttribute('type', 'range')
    })

    test('keeps a stored volume above 100 saveable (backend range 1-200)', async () => {
        const user = userEvent.setup()
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: { defaultVolume: 150 } },
        } as never)
        vi.mocked(api.modules.updateSettings).mockResolvedValue({
            data: {},
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)
        await waitFor(() => {
            expect(screen.getByText('150%')).toBeInTheDocument()
        })
        await user.click(
            screen.getByRole('button', { name: /save configuration/i }),
        )

        await waitFor(() => {
            expect(api.modules.updateSettings).toHaveBeenCalledWith(
                mockGuildId,
                'music',
                expect.objectContaining({ defaultVolume: 150 }),
            )
        })
    })

    test('clamps an out-of-range stored volume into 1-200', async () => {
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: { defaultVolume: 0 } },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('1%')).toBeInTheDocument()
        })
    })

    test('ignores a slow response for a previously selected guild', async () => {
        let resolveOld: (value: unknown) => void = () => {}
        vi.mocked(api.modules.getSettings)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveOld = resolve
                    }) as never,
            )
            .mockResolvedValueOnce({
                data: { settings: { defaultVolume: 30 } },
            } as never)

        const { rerender } = render(<MusicConfig guildId='999999999' />)
        rerender(<MusicConfig guildId={mockGuildId} />)
        await waitFor(() => {
            expect(screen.getByText('30%')).toBeInTheDocument()
        })

        await act(async () => {
            resolveOld({ data: { settings: { defaultVolume: 90 } } })
        })

        expect(screen.getByText('30%')).toBeInTheDocument()
        expect(screen.queryByText('90%')).not.toBeInTheDocument()
    })

    test('toggle switches work correctly', async () => {
        const user = userEvent.setup()
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: {
                settings: { autoPlayEnabled: false, shuffleEnabled: false },
            },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        const autoplayToggle = screen.getByLabelText(/toggle autoplay/i)
        await user.click(autoplayToggle)

        expect(autoplayToggle).toBeChecked()
    })

    test('submits form and shows success toast', async () => {
        const user = userEvent.setup()
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: null },
        } as never)
        vi.mocked(api.modules.updateSettings).mockResolvedValue({
            data: {},
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        const submitButton = screen.getByRole('button', {
            name: /save configuration/i,
        })
        await user.click(submitButton)

        await waitFor(() => {
            expect(api.modules.updateSettings).toHaveBeenCalledWith(
                mockGuildId,
                'music',
                {
                    defaultVolume: 50,
                    autoPlayEnabled: true,
                    repeatMode: 0,
                    shuffleEnabled: false,
                },
            )
            expect(toast.success).toHaveBeenCalledWith(
                'Music configuration saved successfully!',
            )
        })
    })

    test('shows error toast on submit failure', async () => {
        const user = userEvent.setup()
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: null },
        } as never)
        vi.mocked(api.modules.updateSettings).mockRejectedValue(
            new Error('Network error'),
        )

        render(<MusicConfig guildId={mockGuildId} />)

        const submitButton = screen.getByRole('button', {
            name: /save configuration/i,
        })
        await user.click(submitButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                'Failed to save music configuration',
            )
        })
    })

    test('repeat mode select renders', () => {
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: null },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        const selectTrigger = screen.getByRole('combobox', {
            name: /select repeat mode/i,
        })
        expect(selectTrigger).toBeInTheDocument()
    })

    test('disables submit button while loading', async () => {
        const user = userEvent.setup()
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: null },
        } as never)
        vi.mocked(api.modules.updateSettings).mockImplementation(
            () =>
                new Promise((resolve) =>
                    setTimeout(() => resolve({ data: {} } as never), 100),
                ),
        )

        render(<MusicConfig guildId={mockGuildId} />)

        const submitButton = screen.getByRole('button', {
            name: /save configuration/i,
        })
        await user.click(submitButton)

        await waitFor(() => {
            expect(submitButton).toBeDisabled()
        })
    })
})
