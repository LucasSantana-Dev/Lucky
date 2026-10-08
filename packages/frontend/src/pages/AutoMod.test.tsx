import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AutoModPage from './AutoMod'
import { api } from '@/services/api'
import { ApiError } from '@/services/ApiError'
import { useGuildStore } from '@/stores/guildStore'
import type { AutoModSettings } from '@/types'
import i18n from '@/lib/i18n'

vi.mock('@/services/api')
vi.mock('@/stores/guildStore')
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

const mockGuild = {
    id: '123',
    name: 'Test Guild',
    icon: null,
    owner: true,
    permissions: '8',
    features: [],
    approximate_member_count: 100,
    approximate_presence_count: 50,
}

const mockSettings: AutoModSettings = {
    id: 'settings1',
    guildId: '123',
    enabled: true,
    spamEnabled: true,
    spamThreshold: 5,
    spamTimeWindow: 5,
    exemptChannels: [],
    exemptRoles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

function mockGuildStore(guild: typeof mockGuild | null) {
    vi.mocked(useGuildStore).mockReturnValue({
        guilds: guild ? [guild] : [],
        selectedGuild: guild as any,
        selectGuild: vi.fn(),
        isLoading: false,
        error: null,
        fetchGuilds: vi.fn(),
    } as any)
}

const renderPage = () => {
    return render(
        <MemoryRouter>
            <AutoModPage />
        </MemoryRouter>,
    )
}

describe('AutoModPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as any)
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: { roles: [] },
        } as any)
        vi.mocked(api.automod.listTemplates).mockResolvedValue({
            data: { templates: [] },
        } as any)
    })

    test('shows no server selected when no guild', () => {
        mockGuildStore(null)
        renderPage()
        expect(screen.getByText('No Server Selected')).toBeInTheDocument()
        expect(
            screen.getByText('Select a server to configure auto-moderation'),
        ).toBeInTheDocument()
    })

    test('shows loading skeletons while fetching', () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockImplementation(
            () => new Promise(() => {}),
        )
        renderPage()
        const skeletons = document.querySelectorAll('.animate-pulse')
        expect(skeletons.length).toBeGreaterThan(0)
    })

    test('renders filter cards on success', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })
        for (const removed of [
            'Caps Lock Detection',
            'Link Filtering',
            'Invite Link Filtering',
            'Banned Words',
        ]) {
            expect(screen.queryByText(removed)).not.toBeInTheDocument()
        }
    })

    test('renders header with guild name', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
            expect(
                screen.getByText(
                    /Configure automatic content filters for Test Guild/,
                ),
            ).toBeInTheDocument()
        })
    })

    test('toggles spam filter card', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        const spamSwitch = switches[0]

        expect(spamSwitch).toBeChecked()

        await user.click(spamSwitch)

        expect(spamSwitch).not.toBeChecked()
    })

    test('no button contains a nested switch or another button (#2427)', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })

        for (const button of screen.getAllByRole('button')) {
            expect(within(button).queryByRole('switch')).not.toBeInTheDocument()
            expect(button.querySelectorAll('button').length).toBe(0)
        }
    })

    test('switch is named after its filter and clicking the row toggles it', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })

        const spamSwitch = screen.getByRole('switch', {
            name: 'Spam Detection',
        })
        expect(spamSwitch).toBeChecked()

        await user.click(screen.getByText('Spam Detection'))
        expect(spamSwitch).not.toBeChecked()
    })

    test('switch exposes the filter description to assistive tech', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        const spamSwitch = await screen.findByRole('switch', {
            name: 'Spam Detection',
        })
        expect(spamSwitch).toHaveAccessibleDescription(/\S/)
        const ids = screen
            .getAllByRole('switch')
            .map((el) => el.getAttribute('aria-describedby'))
        expect(new Set(ids).size).toBe(ids.length)
    })

    test('save button calls updateSettings with sanitized settings payload', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: {
                settings: {
                    ...mockSettings,
                    capsEnabled: true,
                    capsThreshold: 70,
                    allowedDomains: ['example.com'],
                    linksEnabled: true,
                    invitesEnabled: true,
                    wordsEnabled: true,
                    bannedWords: ['badword'],
                },
            },
        } as any)
        vi.mocked(api.automod.updateSettings).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]

        await user.click(saveButton)

        await waitFor(() => {
            expect(api.automod.updateSettings).toHaveBeenCalledWith(
                '123',
                expect.any(Object),
            )
        })

        const payload = vi.mocked(api.automod.updateSettings).mock
            .calls[0][1] as Record<string, unknown>

        expect(payload).toMatchObject({
            spamEnabled: true,
        })
        expect(payload).not.toHaveProperty('capsEnabled')
        expect(payload).not.toHaveProperty('capsThreshold')
        expect(payload).not.toHaveProperty('allowedDomains')
        expect(payload).not.toHaveProperty('linksEnabled')
        expect(payload).not.toHaveProperty('invitesEnabled')
        expect(payload).not.toHaveProperty('wordsEnabled')
        expect(payload).not.toHaveProperty('bannedWords')
        expect(payload).not.toHaveProperty('id')
        expect(payload).not.toHaveProperty('guildId')
        expect(payload).not.toHaveProperty('createdAt')
        expect(payload).not.toHaveProperty('updatedAt')
    })

    test('save success shows toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.updateSettings).mockResolvedValue({} as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]

        await user.click(saveButton)

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(
                'Auto-moderation settings saved!',
            )
        })
    })

    test('save failure shows error toast', async () => {
        const user = userEvent.setup()
        const { toast } = await import('sonner')
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.updateSettings).mockRejectedValue(
            new Error('Network error'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const saveButton = screen.getAllByRole('button', {
            name: /Save Changes/,
        })[0]

        await user.click(saveButton)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to save settings')
        })
    })

    test('adds an exempt channel ID via TagList', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        const input = await screen.findByPlaceholderText('Channel ID...')
        const addButton = input.nextElementSibling as HTMLElement

        await user.type(input, '111')
        await user.click(addButton)

        await waitFor(() => {
            expect(screen.getAllByText('111')).toHaveLength(2)
        })
    })

    test('removes an exempt channel ID via TagList', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: { ...mockSettings, exemptChannels: ['111'] } },
        } as any)

        renderPage()

        const badgeElement = (await screen.findAllByText('111'))[0]
        const removeButton = badgeElement.querySelector('button')

        expect(removeButton).toBeInTheDocument()

        await user.click(removeButton!)

        await waitFor(() => {
            expect(screen.queryByText('111')).not.toBeInTheDocument()
        })
    })

    test('adds an exempt channel ID via Enter key', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        const input = await screen.findByPlaceholderText('Channel ID...')

        await user.type(input, '222{Enter}')

        await waitFor(() => {
            expect(screen.getAllByText('222')).toHaveLength(2)
        })
    })

    test('does not add duplicate exempt channel ID', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: { ...mockSettings, exemptChannels: ['111'] } },
        } as any)

        renderPage()

        const input = await screen.findByPlaceholderText('Channel ID...')
        const addButton = input.nextElementSibling as HTMLElement

        await user.type(input, '111')
        await user.click(addButton)

        expect(screen.getAllByText('111')).toHaveLength(2)
    })

    test('updates spam threshold via number input', async () => {
        const user = userEvent.setup()
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        })

        const label = screen.getByText('Max messages')
        const thresholdInput = label.closest('div')!.querySelector('input')!

        expect(thresholdInput).toHaveValue(5)

        await user.clear(thresholdInput)
        await user.type(thresholdInput, '10')

        expect(thresholdInput).toHaveValue(10)
    })

    test('renders exemptions section', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Exemptions')).toBeInTheDocument()
            expect(screen.getByText('Exempt Channels')).toBeInTheDocument()
            expect(screen.getByText('Exempt Roles')).toBeInTheDocument()
        })
    })

    test('uses default settings on API error', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockRejectedValue(
            new Error('Not found'),
        )

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        switches.forEach((switchElement) => {
            expect(switchElement).not.toBeChecked()
        })
    })

    test('blocks save and shows error banner when settings fail to load', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockRejectedValue(
            new Error('Not found'),
        )

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText(
                    'Failed to load automod settings. Saving is disabled until settings load successfully.',
                ),
            ).toBeInTheDocument()
        })

        const saveButtons = screen.getAllByRole('button', {
            name: /Save Changes/,
        })
        saveButtons.forEach((button) => expect(button).toBeDisabled())

        expect(api.automod.updateSettings).not.toHaveBeenCalled()
    })

    test('uses default settings when API returns malformed success payload', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: undefined },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        expect(screen.getByText('Spam Detection')).toBeInTheDocument()
        const switches = screen.getAllByRole('switch')
        switches.forEach((switchElement) => {
            expect(switchElement).not.toBeChecked()
        })
    })

    test('normalizes malformed scalar and date values from API payload', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: {
                settings: {
                    ...mockSettings,
                    spamEnabled: true,
                    spamThreshold: 'bad',
                    spamTimeWindow: '10',
                    exemptChannels: ['123', 456],
                    exemptRoles: ['789', null],
                    createdAt: '2026-01-02T03:04:05.000Z',
                    updatedAt: 'invalid-date',
                },
            },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        const switches = screen.getAllByRole('switch')
        expect(switches[0]).toBeChecked()

        expect(screen.getByDisplayValue(5)).toBeInTheDocument()
        expect(screen.getByDisplayValue(10)).toBeInTheDocument()
        expect(screen.getAllByText('123')).toHaveLength(2)
        expect(screen.getAllByText('789')).toHaveLength(2)
    })

    test('falls back for out-of-range numeric values from API payload', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: {
                settings: {
                    ...mockSettings,
                    spamThreshold: '-1',
                    spamTimeWindow: '999',
                },
            },
        } as any)

        renderPage()

        await waitFor(() => {
            expect(screen.getByText('Auto-Moderation')).toBeInTheDocument()
        })

        expect(screen.getAllByDisplayValue('5')).toHaveLength(2)
    })

    const setTemplateContext = (template: {
        id: string
        name: string
        description: string
    }) => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.listTemplates).mockResolvedValue({
            data: { templates: [template] },
        } as any)
    }

    const clickTemplateApply = async (label: string) => {
        const user = userEvent.setup()
        renderPage()
        await user.click(
            await screen.findByRole('button', {
                name: `Apply ${label} template`,
            }),
        )
    }

    test('applies template and shows success toast', async () => {
        const { toast } = await import('sonner')
        setTemplateContext({
            id: 'balanced',
            name: 'Balanced',
            description: 'Safe defaults',
        })
        vi.mocked(api.automod.applyTemplate).mockResolvedValue({
            data: { settings: { ...mockSettings, spamThreshold: 8 } },
        } as any)

        await clickTemplateApply('Balanced')

        await waitFor(() => {
            expect(api.automod.applyTemplate).toHaveBeenCalledWith(
                mockGuild.id,
                'balanced',
            )
            expect(toast.success).toHaveBeenCalledWith(
                'Auto-moderation template applied',
            )
        })
    })

    test.each([
        {
            name: 'shows API error message when template apply fails with ApiError',
            template: {
                id: 'strict',
                name: 'Strict',
                description: 'Strict defaults',
            },
            error: new ApiError(404, 'Template not found'),
            expectedToast: 'Template not found',
        },
        {
            name: 'shows generic error when template apply fails unexpectedly',
            template: {
                id: 'light',
                name: 'Light',
                description: 'Light defaults',
            },
            error: new Error('boom'),
            expectedToast: 'Failed to apply template',
        },
    ])('$name', async ({ template, error, expectedToast }) => {
        const { toast } = await import('sonner')
        setTemplateContext(template)
        vi.mocked(api.automod.applyTemplate).mockRejectedValue(error)
        await clickTemplateApply(template.name)

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expectedToast)
        })
    })

    test('shows error banner when templates fail to load', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.automod.listTemplates).mockRejectedValue(
            new Error('boom'),
        )

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load templates'),
            ).toBeInTheDocument()
        })
    })

    test('shows error banner when channels fail to load', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.guilds.getChannels).mockRejectedValue(new Error('boom'))

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load Discord channels'),
            ).toBeInTheDocument()
        })
    })

    test('shows error banner when roles fail to load', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
        vi.mocked(api.guilds.getRbac).mockRejectedValue(new Error('boom'))

        renderPage()

        await waitFor(() => {
            expect(
                screen.getByText('Failed to load Discord roles'),
            ).toBeInTheDocument()
        })
    })
})

describe('AutoModPage in pt-BR', () => {
    let previousLanguage: string

    beforeEach(async () => {
        vi.clearAllMocks()
        previousLanguage = i18n.language
        await i18n.changeLanguage('pt-BR')
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as any)
        vi.mocked(api.guilds.getRbac).mockResolvedValue({
            data: { roles: [] },
        } as any)
        vi.mocked(api.automod.listTemplates).mockResolvedValue({
            data: { templates: [] },
        } as any)
        vi.mocked(api.automod.getSettings).mockResolvedValue({
            data: { settings: mockSettings },
        } as any)
    })

    afterEach(async () => {
        await i18n.changeLanguage(previousLanguage)
    })

    test('translates the empty server state', () => {
        mockGuildStore(null)
        renderPage()
        expect(
            screen.getByText('Nenhum Servidor Selecionado'),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Selecione um servidor para configurar a auto-moderação',
            ),
        ).toBeInTheDocument()
    })

    test('translates the page chrome and filter rows', async () => {
        mockGuildStore(mockGuild)
        renderPage()
        expect(await screen.findByText('Detecção de Spam')).toBeInTheDocument()
        expect(screen.getByText('Auto-moderação')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Configure filtros automáticos de conteúdo para Test Guild',
            ),
        ).toBeInTheDocument()
        expect(screen.getByText('Modelos')).toBeInTheDocument()
        expect(
            screen.getByText('Nenhum modelo disponível no momento.'),
        ).toBeInTheDocument()
        expect(screen.getByText('Filtros de Conteúdo')).toBeInTheDocument()
        expect(screen.getByText('Isenções')).toBeInTheDocument()
        expect(screen.getByText('Canais Isentos')).toBeInTheDocument()
        expect(screen.getByText('Funções Isentas')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Canais indisponíveis, insira IDs manualmente abaixo',
            ),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Funções indisponíveis, insira IDs manualmente abaixo',
            ),
        ).toBeInTheDocument()
        expect(
            screen.getByPlaceholderText('ID do canal...'),
        ).toBeInTheDocument()
        expect(
            screen.getByPlaceholderText('ID da função...'),
        ).toBeInTheDocument()
        expect(
            screen.getAllByRole('button', { name: /Salvar Alterações/ }).length,
        ).toBeGreaterThan(0)
    })

    test('translates the load error banners', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.guilds.getChannels).mockRejectedValue(new Error('boom'))
        vi.mocked(api.guilds.getRbac).mockRejectedValue(new Error('boom'))
        vi.mocked(api.automod.listTemplates).mockRejectedValue(
            new Error('boom'),
        )
        renderPage()
        expect(
            await screen.findByText('Falha ao carregar os modelos'),
        ).toBeInTheDocument()
        expect(
            await screen.findByText('Falha ao carregar os canais do Discord'),
        ).toBeInTheDocument()
        expect(
            await screen.findByText('Falha ao carregar as funções do Discord'),
        ).toBeInTheDocument()
    })

    test('translates the settings load error', async () => {
        mockGuildStore(mockGuild)
        vi.mocked(api.automod.getSettings).mockRejectedValue(new Error('boom'))
        renderPage()
        expect(
            await screen.findByText(
                /Falha ao carregar as configurações de auto-moderação/,
            ),
        ).toBeInTheDocument()
    })

    test('translates the save toasts', async () => {
        mockGuildStore(mockGuild)
        const { toast } = await import('sonner')
        vi.mocked(api.automod.updateSettings).mockResolvedValueOnce({} as any)
        const user = userEvent.setup()
        renderPage()
        await screen.findByText('Detecção de Spam')
        await user.click(
            screen.getAllByRole('button', { name: /Salvar Alterações/ })[0],
        )
        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(
                'Configurações de auto-moderação salvas!',
            ),
        )
        vi.mocked(api.automod.updateSettings).mockRejectedValueOnce(
            new Error('boom'),
        )
        await user.click(
            screen.getAllByRole('button', { name: /Salvar Alterações/ })[0],
        )
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                'Falha ao salvar as configurações',
            ),
        )
    })

    test('translates the template button and toasts', async () => {
        mockGuildStore(mockGuild)
        const { toast } = await import('sonner')
        vi.mocked(api.automod.listTemplates).mockResolvedValue({
            data: {
                templates: [{ id: 't1', name: 'Basic', description: 'd' }],
            },
        } as any)
        vi.mocked(api.automod.applyTemplate)
            .mockResolvedValueOnce({ data: { settings: mockSettings } } as any)
            .mockRejectedValueOnce(new Error('boom'))
        const user = userEvent.setup()
        renderPage()
        const button = await screen.findByRole('button', {
            name: 'Aplicar o modelo Basic',
        })
        expect(within(button).getByText('Aplicar modelo')).toBeInTheDocument()
        await user.click(button)
        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(
                'Modelo de auto-moderação aplicado',
            ),
        )
        await user.click(
            await screen.findByRole('button', {
                name: 'Aplicar o modelo Basic',
            }),
        )
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                'Falha ao aplicar o modelo',
            ),
        )
    })
})
