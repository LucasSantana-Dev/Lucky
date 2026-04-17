import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { toast } from 'sonner'

let mockGet: any
let mockPut: any

vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => ({
            get: (...args: any[]) => mockGet(...args),
            put: (...args: any[]) => mockPut(...args),
        })),
    },
}))

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

import AutoplayGenres from './AutoplayGenres'

describe('AutoplayGenres', () => {
    const mockGuildId = 'guild-1'

    beforeEach(() => {
        vi.clearAllMocks()
        mockGet = vi.fn()
        mockPut = vi.fn()
    })

    test('renders component with title', async () => {
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        expect(screen.getByText('Autoplay Genre Preferences')).toBeInTheDocument()
    })

    test('loads genres on mount', async () => {
        mockGet.mockResolvedValue({
            data: { genres: ['rock', 'pop'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        await waitFor(() => {
            expect(screen.getByText('rock')).toBeInTheDocument()
            expect(screen.getByText('pop')).toBeInTheDocument()
        })
    })

    test('displays suggested genres', async () => {
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('Suggested Genres')).toBeInTheDocument()
        })
    })

    test('clicking suggested genre fills input', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const rockButton = screen.getAllByRole('button').find(
            (btn) => btn.textContent === 'rock'
        )
        await user.click(rockButton!)

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        expect(input).toHaveValue('rock')
    })

    test('adds genre when enter pressed in input', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockResolvedValue({
            data: { genres: ['metal'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'metal')
        await user.keyboard('{Enter}')

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalled()
        })
    })

    test('adds genre when add button clicked', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockResolvedValue({
            data: { genres: ['jazz'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'jazz')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalled()
        })
    })

    test('prevents adding empty genre', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        expect(mockPut).not.toHaveBeenCalled()
    })

    test('shows error when genre already exists', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: ['rock'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('rock')).toBeInTheDocument()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'rock')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        expect(toast.error).toHaveBeenCalledWith('Genre already added')
    })

    test('prevents adding when max limit reached', async () => {
        mockGet.mockResolvedValue({
            data: {
                genres: ['rock', 'pop', 'jazz', 'metal', 'indie'],
            },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('rock')).toBeInTheDocument()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        expect(input).toBeDisabled()
    })

    test('removes genre when remove button clicked', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: ['rock', 'pop'] },
        })
        mockPut.mockResolvedValue({
            data: { genres: ['pop'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('rock')).toBeInTheDocument()
        })

        const removeButtons = screen.getAllByLabelText(/Remove/)
        await user.click(removeButtons[0])

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalled()
        })
    })

    test('shows error when load fails', async () => {
        mockGet.mockRejectedValue(new Error('Network error'))

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load autoplay genres')
            ).toBeInTheDocument()
        })
    })

    test('shows error when update fails', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockRejectedValue(new Error('Network error'))

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'rock')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        await waitFor(() => {
            expect(
                screen.getByText('Failed to update autoplay genres')
            ).toBeInTheDocument()
        })
    })

    test('clears input after successful add', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockResolvedValue({
            data: { genres: ['rock'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(
            /e.g., rock, pop, jazz/
        ) as HTMLInputElement
        await user.type(input, 'rock')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        await waitFor(() => {
            expect(input.value).toBe('')
        })
    })

    test('disables input during loading', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockImplementation(
            () =>
                new Promise((resolve) =>
                    setTimeout(
                        () =>
                            resolve({ data: { genres: ['rock'] } }),
                        50
                    )
                )
        )

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'rock')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        expect(input).toBeDisabled()
    })

    test('hides suggested genres when at max limit', async () => {
        mockGet.mockResolvedValue({
            data: {
                genres: ['rock', 'pop', 'jazz', 'metal', 'indie'],
            },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('rock')).toBeInTheDocument()
        })

        expect(screen.queryByText('Suggested Genres')).not.toBeInTheDocument()
    })

    test('normalizes genre text case', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockResolvedValue({
            data: { genres: ['rock'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'ROCK')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalled()
        })
    })

    test('shows success toast on successful update', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockResolvedValue({
            data: { genres: ['rock'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'rock')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('Autoplay genres updated')
        })
    })

    test('shows toast error on update failure', async () => {
        const user = userEvent.setup()
        mockGet.mockResolvedValue({
            data: { genres: [] },
        })
        mockPut.mockRejectedValue(new Error('Network error'))

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(mockGet).toHaveBeenCalled()
        })

        const input = screen.getByPlaceholderText(/e.g., rock, pop, jazz/)
        await user.type(input, 'rock')

        const addButtons = screen.getAllByRole('button').filter(btn => btn.textContent?.includes('Add'))
        await user.click(addButtons[addButtons.length - 1])

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to update autoplay genres')
        })
    })

    test('displays genre count correctly', async () => {
        mockGet.mockResolvedValue({
            data: { genres: ['rock', 'pop', 'jazz'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText(/Selected Genres \(3\/5\)/)).toBeInTheDocument()
        })
    })

    test('filters suggested genres already selected', async () => {
        mockGet.mockResolvedValue({
            data: { genres: ['rock'] },
        })

        render(<AutoplayGenres guildId={mockGuildId} />)

        await waitFor(() => {
            expect(screen.getByText('rock')).toBeInTheDocument()
        })

        const rockButtons = screen.getAllByRole('button').filter(btn => btn.textContent === 'rock')
        expect(rockButtons.length).toBe(1)
    })
})
