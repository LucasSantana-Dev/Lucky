import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommandsConfig from './CommandsConfig'
import { api } from '@/services/api'
import type { Command } from '@/types'

vi.mock('@/services/api')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

const mockCommands: Command[] = [
    {
        id: 'cmd1',
        name: 'play',
        description: 'Play a song',
        response: 'Now playing!',
        enabled: true,
        useCount: 3,
        commandKind: 'basic',
    },
]

describe('CommandsConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders commands without an undefined category chip', async () => {
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)

        render(<CommandsConfig guildId='guild-1' />)

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })
        expect(screen.queryByText('undefined')).not.toBeInTheDocument()
    })

    test('toggling a command calls api.commands.toggle keyed by name, not id', async () => {
        const user = userEvent.setup()
        vi.mocked(api.commands.list).mockResolvedValue({
            data: { commands: mockCommands },
        } as any)
        vi.mocked(api.commands.toggle).mockResolvedValue({} as any)

        render(<CommandsConfig guildId='guild-1' />)

        await waitFor(() => {
            expect(screen.getByText('/play')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('switch'))

        await waitFor(() => {
            expect(api.commands.toggle).toHaveBeenCalledWith(
                'guild-1',
                'play',
                false,
            )
        })
    })
})
