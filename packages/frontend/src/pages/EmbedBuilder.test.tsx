import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import EmbedBuilder from './EmbedBuilder'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'
import type { EmbedTemplate } from '@/services/embedsApi'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api', () => ({
    api: {
        embeds: {
            list: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}))
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }))

function mockGuildStore(overrides: any = {}) {
    vi.mocked(useGuildStore).mockImplementation((selector?: any) => {
        const state = {
            selectedGuild: { id: '123', name: 'Test Guild' },
            ...overrides,
        }
        return typeof selector === 'function' ? selector(state) : state
    })
}

const mockTemplate: EmbedTemplate = {
    id: 'template-1',
    guildId: '123',
    name: 'welcome-message',
    title: 'Welcome!',
    description: 'Welcome to our server',
    color: '#5865F2',
    footer: 'Enjoy your stay',
    thumbnail: null,
    image: null,
    fields: [],
    useCount: 5,
    createdBy: 'user-1',
    createdAt: '2026-03-30T00:00:00Z',
    updatedAt: '2026-03-30T00:00:00Z',
}

describe('EmbedBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows loading skeletons when fetching templates', () => {
        mockGuildStore()
        vi.mocked(api.embeds.list).mockImplementation(
            () => new Promise(() => {}),
        )

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders empty state when no templates exist', async () => {
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No embed templates')).toBeInTheDocument()
            expect(
                screen.getByText(
                    'Create your first embed template to use in bot commands',
                ),
            ).toBeInTheDocument()
        })
    })

    test('renders template cards when templates exist', async () => {
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([mockTemplate])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('welcome-message')).toBeInTheDocument()
            expect(screen.getByText('Welcome!')).toBeInTheDocument()
            expect(
                screen.getByText('Welcome to our server'),
            ).toBeInTheDocument()
            expect(screen.getByText(/Used 5×/)).toBeInTheDocument()
        })
    })

    test('opens create modal when new template button clicked', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const createButton = screen.getAllByText(
            /Create Template|New Template/,
        )[0]
        await user.click(createButton)

        expect(screen.getByText('New Embed Template')).toBeInTheDocument()
    })

    test('opens edit modal when edit button clicked', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([mockTemplate])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('welcome-message'))

        const editButton = screen.getByLabelText('Edit welcome-message')
        await user.click(editButton)

        expect(screen.getByText('Edit Embed Template')).toBeInTheDocument()
    })

    test('shows validation error when template name is empty', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        const saveButtons = screen.getAllByRole('button', {
            name: 'Create Template',
        })
        await user.click(saveButtons[saveButtons.length - 1])

        expect(screen.getByText('Name is required')).toBeInTheDocument()
    })

    test('creates new template successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])
        vi.mocked(api.embeds.create).mockResolvedValue(mockTemplate)

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        const nameInput = screen.getByPlaceholderText('e.g. welcome-message')
        await user.type(nameInput, 'test-embed')

        const titleInput = screen.getByPlaceholderText('Embed title')
        await user.type(titleInput, 'Test Title')

        vi.mocked(api.embeds.list).mockResolvedValue([mockTemplate])

        const saveButtons = screen.getAllByRole('button', {
            name: 'Create Template',
        })
        await user.click(saveButtons[saveButtons.length - 1])

        await waitFor(() => {
            expect(api.embeds.create).toHaveBeenCalledWith('123', {
                name: 'test-embed',
                embedData: expect.objectContaining({
                    title: 'Test Title',
                }),
            })
        })
    })

    test('updates existing template successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([mockTemplate])
        vi.mocked(api.embeds.update).mockResolvedValue({
            ...mockTemplate,
            title: 'Updated Title',
        })

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('welcome-message'))

        const editButton = screen.getByLabelText('Edit welcome-message')
        await user.click(editButton)

        const titleInput = screen.getByDisplayValue('Welcome!')
        await user.clear(titleInput)
        await user.type(titleInput, 'Updated Title')

        const saveButton = screen.getByText('Save Changes')
        await user.click(saveButton)

        await waitFor(() => {
            expect(api.embeds.update).toHaveBeenCalledWith(
                '123',
                'welcome-message',
                expect.objectContaining({
                    title: 'Updated Title',
                }),
            )
        })
    })

    test('adds and removes fields in embed builder', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        const addFieldButton = screen.getByText('Add Field')
        await user.click(addFieldButton)

        const fieldNameInput = screen.getByPlaceholderText('Field name')
        expect(fieldNameInput).toBeInTheDocument()

        const fieldValueInput = screen.getByPlaceholderText('Field value')
        expect(fieldValueInput).toBeInTheDocument()

        const removeButton = screen.getByLabelText('Remove field 1')
        await user.click(removeButton)

        expect(
            screen.queryByPlaceholderText('Field name'),
        ).not.toBeInTheDocument()
    })

    test('opens delete confirmation modal', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([mockTemplate])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('welcome-message'))

        const deleteButton = screen.getByLabelText('Delete welcome-message')
        await user.click(deleteButton)

        expect(screen.getByText('Delete Template')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Delete' }),
        ).toBeInTheDocument()
    })

    test('deletes template successfully', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([mockTemplate])
        vi.mocked(api.embeds.delete).mockResolvedValue(undefined)

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('welcome-message'))

        const deleteButton = screen.getByLabelText('Delete welcome-message')
        await user.click(deleteButton)

        vi.mocked(api.embeds.list).mockResolvedValue([])

        const confirmButton = screen.getByRole('button', { name: 'Delete' })
        await user.click(confirmButton)

        await waitFor(() => {
            expect(api.embeds.delete).toHaveBeenCalledWith(
                '123',
                'welcome-message',
            )
        })
    })

    test('shows preview when form has content', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        expect(
            screen.getByText('Fill in the fields to see a preview'),
        ).toBeInTheDocument()

        const titleInput = screen.getByPlaceholderText('Embed title')
        await user.type(titleInput, 'Preview Test')

        await waitFor(() => {
            expect(
                screen.queryByText('Fill in the fields to see a preview'),
            ).not.toBeInTheDocument()
        })
    })

    test('handles API error when loading templates', async () => {
        mockGuildStore()
        vi.mocked(api.embeds.list).mockRejectedValue(new Error('Network error'))

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('No embed templates')).toBeInTheDocument()
        })
    })

    test('closes modal when cancel button clicked', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        expect(screen.getByText('New Embed Template')).toBeInTheDocument()

        const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
        await user.click(cancelButtons[0])

        await waitFor(() => {
            expect(
                screen.queryByText('New Embed Template'),
            ).not.toBeInTheDocument()
        })
    })

    test('displays color picker and hex input', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        const colorInput = screen.getByDisplayValue('#5865F2')
        expect(colorInput).toBeInTheDocument()
    })

    test('toggles inline field option', async () => {
        const user = userEvent.setup()
        mockGuildStore()
        vi.mocked(api.embeds.list).mockResolvedValue([])

        render(
            <MemoryRouter>
                <EmbedBuilder />
            </MemoryRouter>,
        )

        await waitFor(() => screen.getByText('No embed templates'))

        const newButton = screen.getAllByText(/New Template/)[0]
        await user.click(newButton)

        const addFieldButton = screen.getByText('Add Field')
        await user.click(addFieldButton)

        const inlineCheckbox = screen.getByLabelText('Inline')
        expect(inlineCheckbox).not.toBeChecked()

        await user.click(inlineCheckbox)
        expect(inlineCheckbox).toBeChecked()
    })
})
