import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from 'i18next'
import ModerationSettingsForm from './ModerationSettingsForm'
import { api } from '@/services/api'

vi.mock('@/services/api')

i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['moderation'],
    defaultNS: 'moderation',
    interpolation: { escapeValue: false },
    resources: {
        en: {
            moderation: {
                settingsTitle: 'Moderation settings',
                settingsLogChannel: 'Log channel',
                settingsMuteRole: 'Mute role',
                settingsModRoles: 'Moderator roles',
                settingsMaxWarnings: 'Warnings before action',
                settingsDmOnAction: 'Message members when moderated',
                settingsNone: 'None',
                settingsSave: 'Save settings',
                settingsSaving: 'Saving...',
                settingsSaved: 'Settings saved',
                settingsLoadFailed: 'Failed to load settings',
                settingsSaveFailed: 'Failed to save settings',
                settingsChannelsFailed: 'Failed to load channels',
                settingsRolesFailed: 'Failed to load roles',
                settingsRetry: 'Retry',
                settingsModRolesLimit: 'Role limit hint',
            },
        },
    },
})

const settings = {
    id: 's1',
    guildId: 'g1',
    modLogChannelId: 'c1',
    muteRoleId: null,
    modRoleIds: ['r1'],
    autoModEnabled: false,
    maxWarnings: 3,
    dmOnAction: true,
    requireReason: true,
}

function setup(override: Record<string, unknown> = {}) {
    vi.mocked(api.guilds.getChannels).mockResolvedValue({
        data: {
            channels: [
                { id: 'c1', name: 'mod-log' },
                { id: 'c2', name: 'staff' },
            ],
        },
    } as any)
    vi.mocked(api.guilds.getRoles).mockResolvedValue({
        data: {
            roles: [
                { id: 'r1', name: 'Mods', color: 0, position: 2 },
                { id: 'r2', name: 'Muted', color: 0, position: 1 },
            ],
        },
    } as any)
    vi.mocked(api.moderation.getSettings).mockResolvedValue({
        data: { settings: { ...settings, ...override } },
    } as any)
    return render(
        <I18nextProvider i18n={i18n}>
            <ModerationSettingsForm guildId='g1' />
        </I18nextProvider>,
    )
}

describe('ModerationSettingsForm', () => {
    beforeEach(() => vi.clearAllMocks())

    test('shows a loading status while settings load', () => {
        vi.mocked(api.guilds.getChannels).mockReturnValue(new Promise(() => {}))
        vi.mocked(api.guilds.getRoles).mockReturnValue(new Promise(() => {}))
        vi.mocked(api.moderation.getSettings).mockReturnValue(
            new Promise(() => {}),
        )
        render(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g1' />
            </I18nextProvider>,
        )
        expect(screen.getByRole('status')).toBeInTheDocument()
    })

    test('populates labelled fields from the loaded settings', async () => {
        setup()
        const channel = await screen.findByLabelText('Log channel')
        expect(channel).toHaveValue('c1')
        expect(screen.getByLabelText('Mute role')).toHaveValue('')
        expect(screen.getByLabelText('Warnings before action')).toHaveValue(3)
        expect(screen.getByLabelText('Mods')).toBeChecked()
        expect(screen.getByLabelText('Muted')).not.toBeChecked()
        expect(
            screen.getByLabelText('Message members when moderated'),
        ).toBeChecked()
        expect(api.moderation.getSettings).toHaveBeenCalledWith('g1')
    })

    test('saves edited values with PATCH and confirms success', async () => {
        const user = userEvent.setup()
        setup()
        vi.mocked(api.moderation.updateSettings).mockResolvedValue({
            data: { settings },
        } as any)

        await user.selectOptions(
            await screen.findByLabelText('Mute role'),
            'r2',
        )
        await user.click(screen.getByLabelText('Muted'))
        await user.clear(screen.getByLabelText('Warnings before action'))
        await user.type(screen.getByLabelText('Warnings before action'), '5')
        await user.click(screen.getByRole('button', { name: 'Save settings' }))

        await waitFor(() =>
            expect(api.moderation.updateSettings).toHaveBeenCalledWith('g1', {
                modLogChannelId: 'c1',
                muteRoleId: 'r2',
                modRoleIds: ['r1', 'r2'],
                maxWarnings: 5,
                dmOnAction: true,
            }),
        )
        expect(await screen.findByText('Settings saved')).toBeInTheDocument()
    })

    test('shows an alert when saving fails', async () => {
        const user = userEvent.setup()
        setup()
        vi.mocked(api.moderation.updateSettings).mockRejectedValue(
            new Error('boom'),
        )

        await user.click(
            await screen.findByRole('button', { name: 'Save settings' }),
        )

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Failed to save settings',
        )
    })

    test('shows an alert when loading fails', async () => {
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as any)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as any)
        vi.mocked(api.moderation.getSettings).mockRejectedValue(
            new Error('boom'),
        )
        render(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g1' />
            </I18nextProvider>,
        )
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Failed to load settings',
        )
    })

    test('shows the server value returned by the save response', async () => {
        const user = userEvent.setup()
        setup()
        vi.mocked(api.moderation.updateSettings).mockResolvedValue({
            data: { settings: { ...settings, maxWarnings: 4 } },
        } as any)

        await user.clear(await screen.findByLabelText('Warnings before action'))
        await user.type(screen.getByLabelText('Warnings before action'), '5')
        await user.click(screen.getByRole('button', { name: 'Save settings' }))

        await waitFor(() =>
            expect(screen.getByLabelText('Warnings before action')).toHaveValue(
                4,
            ),
        )
    })

    test('ignores a save result that resolves after the guild changed', async () => {
        const user = userEvent.setup()
        let resolveSave: (v: unknown) => void = () => {}
        const { rerender } = setup()
        vi.mocked(api.moderation.updateSettings).mockReturnValue(
            new Promise((r) => {
                resolveSave = r
            }) as any,
        )
        vi.mocked(api.moderation.getSettings).mockResolvedValue({
            data: { settings: { ...settings, guildId: 'g2', maxWarnings: 7 } },
        } as any)

        await user.click(
            await screen.findByRole('button', { name: 'Save settings' }),
        )
        rerender(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g2' />
            </I18nextProvider>,
        )
        await waitFor(() =>
            expect(screen.getByLabelText('Warnings before action')).toHaveValue(
                7,
            ),
        )
        resolveSave({ data: { settings: { ...settings, maxWarnings: 1 } } })
        await new Promise((r) => setTimeout(r, 20))

        expect(screen.getByLabelText('Warnings before action')).toHaveValue(7)
        expect(screen.queryByText('Settings saved')).not.toBeInTheDocument()
    })

    test('keeps the form editable when channels fail to load', async () => {
        setup()
        vi.mocked(api.guilds.getChannels).mockRejectedValue(new Error('x'))
        render(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g1' />
            </I18nextProvider>,
        )
        const warnings = await screen.findAllByLabelText(
            'Warnings before action',
        )
        expect(warnings.length).toBeGreaterThan(0)
        expect(
            (await screen.findAllByText('Failed to load channels')).length,
        ).toBeGreaterThan(0)
    })

    test('recovers from a settings load failure after Retry', async () => {
        const user = userEvent.setup()
        vi.mocked(api.guilds.getChannels).mockResolvedValue({
            data: { channels: [] },
        } as any)
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles: [] },
        } as any)
        vi.mocked(api.moderation.getSettings)
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce({ data: { settings } } as any)
        render(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g1' />
            </I18nextProvider>,
        )
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Failed to load settings',
        )
        await user.click(screen.getByRole('button', { name: 'Retry' }))
        expect(await screen.findByLabelText('Log channel')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    test('keeps saved ids that are missing from the loaded lists', async () => {
        const user = userEvent.setup()
        setup({
            modLogChannelId: 'gone-channel',
            muteRoleId: 'gone-role',
            modRoleIds: ['gone-mod'],
        })
        vi.mocked(api.moderation.updateSettings).mockResolvedValue({
            data: { settings },
        } as any)

        expect(await screen.findByLabelText('Log channel')).toHaveValue(
            'gone-channel',
        )
        expect(screen.getByLabelText('Mute role')).toHaveValue('gone-role')
        expect(screen.getByLabelText('gone-mod')).toBeChecked()
        await user.click(screen.getByRole('button', { name: 'Save settings' }))
        await waitFor(() =>
            expect(api.moderation.updateSettings).toHaveBeenCalledWith(
                'g1',
                expect.objectContaining({
                    modLogChannelId: 'gone-channel',
                    muteRoleId: 'gone-role',
                    modRoleIds: ['gone-mod'],
                }),
            ),
        )
    })

    test('disables fields while saving', async () => {
        const user = userEvent.setup()
        setup()
        vi.mocked(api.moderation.updateSettings).mockReturnValue(
            new Promise(() => {}) as any,
        )
        await user.click(
            await screen.findByRole('button', { name: 'Save settings' }),
        )
        expect(screen.getByLabelText('Log channel')).toBeDisabled()
        expect(screen.getByLabelText('Mute role')).toBeDisabled()
        expect(screen.getByLabelText('Warnings before action')).toBeDisabled()
        expect(screen.getByLabelText('Mods')).toBeDisabled()
    })

    test('does not leave Save disabled after a guild switch mid-save', async () => {
        const user = userEvent.setup()
        const { rerender } = setup()
        vi.mocked(api.moderation.updateSettings).mockReturnValue(
            new Promise((_, rej) =>
                setTimeout(() => rej(new Error('x')), 30),
            ) as any,
        )
        await user.click(
            await screen.findByRole('button', { name: 'Save settings' }),
        )
        rerender(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g2' />
            </I18nextProvider>,
        )
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Save settings' }),
            ).toBeEnabled(),
        )
    })

    test('caps moderator roles at 50 and shows a hint', async () => {
        const roles = Array.from({ length: 52 }, (_, i) => ({
            id: `r${i}`,
            name: `Role ${i}`,
            color: 0,
            position: i,
        }))
        setup({ modRoleIds: roles.slice(0, 50).map((r) => r.id) })
        vi.mocked(api.guilds.getRoles).mockResolvedValue({
            data: { roles },
        } as any)
        render(
            <I18nextProvider i18n={i18n}>
                <ModerationSettingsForm guildId='g1' />
            </I18nextProvider>,
        )
        expect(
            (await screen.findAllByText('Role limit hint')).length,
        ).toBeGreaterThan(0)
        expect(screen.getAllByLabelText('Role 51')[0]).toBeDisabled()
        expect(screen.getAllByLabelText('Role 0')[0]).toBeEnabled()
    })
})
