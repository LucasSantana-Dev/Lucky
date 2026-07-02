import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
