import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { api } from '@/services/api'

vi.mock('@/services/api')

import ForumThreadCta from './ForumThreadCta'

describe('ForumThreadCta', () => {
    const guildId = 'guild-1'

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders a link when a thread is mapped', async () => {
        vi.mocked(api.forum.getThread).mockResolvedValue({
            threadId: 't1',
            slug: 'music',
            title: 'Music thread',
            archived: false,
            url: 'https://discord.com/channels/guild-1/t1',
        })

        render(<ForumThreadCta guildId={guildId} slug='music' />)

        const link = await screen.findByRole('link', {
            name: /View discussion on Discord/,
        })
        expect(link).toHaveAttribute(
            'href',
            'https://discord.com/channels/guild-1/t1',
        )
        expect(api.forum.getThread).toHaveBeenCalledWith(guildId, 'music')
    })

    test('renders nothing when no thread is mapped (404)', async () => {
        vi.mocked(api.forum.getThread).mockResolvedValue(null)

        render(<ForumThreadCta guildId={guildId} slug='music' />)

        await waitFor(() => expect(api.forum.getThread).toHaveBeenCalled())
        expect(
            screen.queryByRole('link', { name: /View discussion on Discord/ }),
        ).not.toBeInTheDocument()
    })

    test('renders nothing and does not throw on lookup failure', async () => {
        vi.mocked(api.forum.getThread).mockRejectedValue(new Error('boom'))

        render(<ForumThreadCta guildId={guildId} slug='music' />)

        await waitFor(() => expect(api.forum.getThread).toHaveBeenCalled())
        expect(
            screen.queryByRole('link', { name: /View discussion on Discord/ }),
        ).not.toBeInTheDocument()
    })
})
