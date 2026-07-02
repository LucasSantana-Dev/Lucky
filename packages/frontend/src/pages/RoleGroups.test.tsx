import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import RoleGroups from './RoleGroups'
import { useGuildStore } from '@/stores/guildStore'
import { api } from '@/services/api'

vi.mock('@/stores/guildStore')
vi.mock('@/services/api', () => ({
    api: {
        roleGroups: {
            list: vi.fn(),
            updateTemplate: vi.fn(),
            detachRole: vi.fn(),
        },
        reactionRoles: { list: vi.fn() },
    },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/EmojiPicker', () => ({ default: () => null }))
vi.mock('@/components/reactionRoles/AddStyledRoleForm', () => ({
    AddStyledRoleForm: () => null,
}))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

// Stable references — react-i18next returns a stable `t` per language, so the
// mock must too, or hooks depending on `t` re-fire every render.
const stableT = (key: string) => key
const stableI18n = { language: 'en' }
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: stableT, i18n: stableI18n }),
}))

const mockStore = (guild: unknown) =>
    vi.mocked(useGuildStore).mockReturnValue({ selectedGuild: guild } as never)

describe('RoleGroups', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('shows no-server state when no guild selected', () => {
        mockStore(null)
        render(<RoleGroups />)
        expect(screen.getByText('noServerSelected')).toBeInTheDocument()
    })

    test('renders empty state when there are no groups', async () => {
        mockStore({ id: 'g1' })
        vi.mocked(api.roleGroups.list).mockResolvedValue([])
        vi.mocked(api.reactionRoles.list).mockResolvedValue([])
        render(<RoleGroups />)
        expect(await screen.findByText('noGroupsYet')).toBeInTheDocument()
    })

    test('renders a group card with its name and cross-referenced roles', async () => {
        mockStore({ id: 'g1' })
        vi.mocked(api.roleGroups.list).mockResolvedValue([
            {
                id: 'grp-1',
                guildId: 'g1',
                name: 'Tecnologias',
                color: '0xf673d5',
                hoist: false,
                mentionable: false,
                buttonStyle: 'Primary',
                defaultEmoji: null,
            },
        ])
        vi.mocked(api.reactionRoles.list).mockResolvedValue([
            {
                messageId: 'msg-1',
                channelId: 'c1',
                guildId: 'g1',
                groupId: 'grp-1',
                title: 'Tecnologias Panel',
                mappings: [
                    {
                        id: 'm1',
                        messageId: 'msg-1',
                        roleId: 'r1',
                        label: 'Python',
                    },
                ],
            },
        ] as never)
        render(<RoleGroups />)
        expect(await screen.findByText('Tecnologias')).toBeInTheDocument()
        await waitFor(() =>
            expect(screen.getByText('Python')).toBeInTheDocument(),
        )
    })

    test('shows loading skeleton while fetching', () => {
        mockStore({ id: 'g1' })
        vi.mocked(api.roleGroups.list).mockReturnValue(new Promise(() => {}))
        vi.mocked(api.reactionRoles.list).mockReturnValue(new Promise(() => {}))
        render(<RoleGroups />)
        expect(screen.getByRole('status')).toBeInTheDocument()
    })

    const groupFixture = {
        id: 'grp-1',
        guildId: 'g1',
        name: 'Tecnologias',
        color: '0xf673d5',
        hoist: true,
        mentionable: false,
        buttonStyle: 'Primary',
        defaultEmoji: null,
    }

    function seedOneGroup(withMessage: boolean) {
        mockStore({ id: 'g1' })
        vi.mocked(api.roleGroups.list).mockResolvedValue([groupFixture])
        vi.mocked(api.reactionRoles.list).mockResolvedValue(
            (withMessage
                ? [
                      {
                          messageId: 'msg-1',
                          channelId: 'c1',
                          guildId: 'g1',
                          groupId: 'grp-1',
                          title: 'Panel',
                          mappings: [
                              {
                                  id: 'm1',
                                  messageId: 'msg-1',
                                  roleId: 'r1',
                                  label: 'Python',
                              },
                          ],
                      },
                  ]
                : []) as never,
        )
    }

    test('saving a group calls updateTemplate with 0x-prefixed color', async () => {
        seedOneGroup(true)
        vi.mocked(api.roleGroups.updateTemplate).mockResolvedValue(
            groupFixture as never,
        )
        render(<RoleGroups />)
        fireEvent.click(await screen.findByText('save'))
        await waitFor(() =>
            expect(api.roleGroups.updateTemplate).toHaveBeenCalledWith(
                'g1',
                'grp-1',
                expect.objectContaining({
                    color: expect.stringMatching(/^0x[0-9A-F]{6}$/),
                    hoist: true,
                    buttonStyle: 'Primary',
                    defaultEmoji: null,
                }),
            ),
        )
    })

    test('removing a role calls detachRole with its id', async () => {
        seedOneGroup(true)
        vi.mocked(api.roleGroups.detachRole).mockResolvedValue(true)
        render(<RoleGroups />)
        fireEvent.click(await screen.findByLabelText('removeRole'))
        await waitFor(() =>
            expect(api.roleGroups.detachRole).toHaveBeenCalledWith(
                'g1',
                'grp-1',
                'r1',
            ),
        )
    })

    test('renders group with no linked panel using the empty-roles state', async () => {
        seedOneGroup(false)
        render(<RoleGroups />)
        expect(await screen.findByText('Tecnologias')).toBeInTheDocument()
        expect(screen.getByText('noRolesInGroup')).toBeInTheDocument()
    })

    test('toasts on failed save', async () => {
        const { toast } = await import('sonner')
        seedOneGroup(true)
        vi.mocked(api.roleGroups.updateTemplate).mockRejectedValue(
            new Error('boom'),
        )
        render(<RoleGroups />)
        fireEvent.click(await screen.findByText('save'))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })

    test('toasts on failed detach', async () => {
        const { toast } = await import('sonner')
        seedOneGroup(true)
        vi.mocked(api.roleGroups.detachRole).mockRejectedValue(
            new Error('nope'),
        )
        render(<RoleGroups />)
        fireEvent.click(await screen.findByLabelText('removeRole'))
        await waitFor(() => expect(toast.error).toHaveBeenCalled())
    })

    test('toasts loadError when the list request fails', async () => {
        const { toast } = await import('sonner')
        mockStore({ id: 'g1' })
        vi.mocked(api.roleGroups.list).mockRejectedValue(new Error('down'))
        vi.mocked(api.reactionRoles.list).mockResolvedValue([] as never)
        render(<RoleGroups />)
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('loadError'),
        )
    })

    test('toggles the add-styled-role form and edits style inputs', async () => {
        seedOneGroup(true)
        vi.mocked(api.roleGroups.updateTemplate).mockResolvedValue(
            groupFixture as never,
        )
        render(<RoleGroups />)
        // toggle add-role open then closed
        fireEvent.click(await screen.findByText('addRole'))
        expect(screen.getByText('cancelAddRole')).toBeInTheDocument()
        fireEvent.click(screen.getByText('cancelAddRole'))
        // change color, button style and switches, then save
        fireEvent.change(
            document.getElementById('color-grp-1') as HTMLInputElement,
            { target: { value: '#123abc' } },
        )
        fireEvent.change(
            document.getElementById('style-grp-1') as HTMLSelectElement,
            { target: { value: 'Danger' } },
        )
        fireEvent.click(screen.getByText('save'))
        await waitFor(() =>
            expect(api.roleGroups.updateTemplate).toHaveBeenCalledWith(
                'g1',
                'grp-1',
                expect.objectContaining({
                    color: '0x123ABC',
                    buttonStyle: 'Danger',
                }),
            ),
        )
    })
})
