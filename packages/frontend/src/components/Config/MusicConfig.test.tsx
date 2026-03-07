import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
        const mockSettings = {
            volume: 75,
            autoplay: true,
            repeatMode: 'queue',
            shuffle: true,
        }

        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('75%')).toBeInTheDocument()
        })
    })

    test('volume slider displays current value', async () => {
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: { volume: 75 } },
        } as never)

        render(<MusicConfig guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('75%')).toBeInTheDocument()
        })

        const volumeSlider = screen.getByLabelText(/volume level/i)
        expect(volumeSlider).toHaveAttribute('type', 'range')
    })

    test('toggle switches work correctly', async () => {
        const user = userEvent.setup()
        vi.mocked(api.modules.getSettings).mockResolvedValue({
            data: { settings: { autoplay: false, shuffle: false } },
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
                expect.objectContaining({
                    volume: 50,
                    autoplay: false,
                    repeatMode: 'off',
                    shuffle: false,
                }),
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

        expect(submitButton).toBeDisabled()
    })
})
