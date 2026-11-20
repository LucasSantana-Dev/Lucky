import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import AddBotButton from './AddBotButton'
import { api } from '@/services/api'
import i18n from '@/lib/i18n'
import type { Guild } from '@/types'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/api', () => ({
    api: { guilds: { getInvite: vi.fn() } },
}))

const guild = {
    id: '987654321',
    name: 'Server Without Bot',
    icon: null,
    owner: true,
    permissions: '8',
    features: [],
    botAdded: false,
} as Guild

const clickAddBot = async () => {
    render(<AddBotButton guild={guild} />)
    await userEvent.click(screen.getByRole('button'))
}

describe.each([
    {
        language: 'en',
        opened: 'Invite URL opened in new tab',
        failed: 'Failed to generate invite URL',
    },
    {
        language: 'pt-BR',
        opened: 'Link de convite aberto em uma nova aba',
        failed: 'Falha ao gerar o link de convite',
    },
])('AddBotButton invite toasts in $language (#2466)', (copy) => {
    beforeEach(async () => {
        vi.clearAllMocks()
        vi.spyOn(window, 'open').mockReturnValue(null)
        await i18n.changeLanguage(copy.language)
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await i18n.changeLanguage('en')
    })

    test('opens the invite and shows the localized success toast', async () => {
        vi.mocked(api.guilds.getInvite).mockResolvedValue({
            data: { inviteUrl: 'https://discord.com/invite/test' },
        } as never)

        await clickAddBot()

        await waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(copy.opened),
        )
        expect(window.open).toHaveBeenCalledWith(
            'https://discord.com/invite/test',
            '_blank',
        )
    })

    test('shows the localized error toast when the invite fails', async () => {
        vi.mocked(api.guilds.getInvite).mockRejectedValue(new Error('boom'))

        await clickAddBot()

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(copy.failed),
        )
    })
})
