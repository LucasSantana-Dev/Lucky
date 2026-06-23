import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EmojiPicker from './EmojiPicker'

function deferredFetch(emojis: unknown[]) {
    return vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ emojis }),
    })
}

describe('EmojiPicker', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows the "Pick emoji" placeholder with a Smile icon when no value', () => {
        render(<EmojiPicker value={null} onChange={vi.fn()} guildId='g1' />)
        expect(screen.getByText('Pick emoji')).toBeInTheDocument()
    })

    it('shows the current value when set', () => {
        render(<EmojiPicker value='🎮' onChange={vi.fn()} guildId='g1' />)
        // value is rendered twice (glyph + label)
        expect(screen.getAllByText('🎮').length).toBeGreaterThanOrEqual(1)
    })

    it('opens and closes the popover when the trigger is clicked', () => {
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        const trigger = screen.getByText('Pick emoji')
        fireEvent.click(trigger)
        expect(screen.getByText('Popular')).toBeInTheDocument()
        // clicking the trigger again toggles it closed
        fireEvent.click(trigger)
        expect(screen.queryByText('Popular')).not.toBeInTheDocument()
    })

    it('selects a unicode emoji and closes', () => {
        const onChange = vi.fn()
        render(<EmojiPicker value='' onChange={onChange} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        // 🎉 appears in the Popular category grid
        fireEvent.click(screen.getAllByText('🎉')[0])
        expect(onChange).toHaveBeenCalledWith('🎉')
        expect(screen.queryByText('Popular')).not.toBeInTheDocument()
    })

    it('lazy-loads server emojis only when the Server tab is opened', async () => {
        const fetchMock = deferredFetch([
            { id: '111', name: 'pog', animated: false },
        ])
        vi.stubGlobal('fetch', fetchMock)
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g42' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        expect(fetchMock).not.toHaveBeenCalled() // not fetched on the emoji tab
        fireEvent.click(screen.getByText('Server'))
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith('/api/guilds/g42/emojis'),
        )
        const img = await screen.findByAltText('pog')
        expect(img).toHaveAttribute(
            'src',
            'https://cdn.discordapp.com/emojis/111.png',
        )
    })

    it('renders animated server emojis as .gif and emits the animated format', async () => {
        vi.stubGlobal(
            'fetch',
            deferredFetch([{ id: '222', name: 'spin', animated: true }]),
        )
        const onChange = vi.fn()
        render(<EmojiPicker value='' onChange={onChange} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.click(screen.getByText('Server'))
        const img = await screen.findByAltText('spin')
        expect(img).toHaveAttribute(
            'src',
            'https://cdn.discordapp.com/emojis/222.gif',
        )
        fireEvent.click(img)
        expect(onChange).toHaveBeenCalledWith('<a:spin:222>')
    })

    it('emits the static custom-emoji format when selected', async () => {
        vi.stubGlobal(
            'fetch',
            deferredFetch([{ id: '333', name: 'kek', animated: false }]),
        )
        const onChange = vi.fn()
        render(<EmojiPicker value='' onChange={onChange} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.click(screen.getByText('Server'))
        fireEvent.click(await screen.findByAltText('kek'))
        expect(onChange).toHaveBeenCalledWith('<:kek:333>')
    })

    it('shows an empty state when the server has no custom emojis', async () => {
        vi.stubGlobal('fetch', deferredFetch([]))
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.click(screen.getByText('Server'))
        expect(
            await screen.findByText('No custom emojis found'),
        ).toBeInTheDocument()
    })

    it('silently falls back to empty when the emoji fetch fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: false, json: () => ({}) }),
        )
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.click(screen.getByText('Server'))
        expect(
            await screen.findByText('No custom emojis found'),
        ).toBeInTheDocument()
    })

    it('swaps a broken custom-emoji image for the fallback svg', async () => {
        vi.stubGlobal(
            'fetch',
            deferredFetch([{ id: '444', name: 'oops', animated: false }]),
        )
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.click(screen.getByText('Server'))
        const img = await screen.findByAltText('oops')
        fireEvent.error(img)
        expect((img as HTMLImageElement).src).toContain('data:image/svg+xml')
    })

    it('switches back to the Emoji tab from Server', async () => {
        vi.stubGlobal('fetch', deferredFetch([]))
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.click(screen.getByText('Server'))
        await screen.findByText('No custom emojis found')
        fireEvent.click(screen.getByText('Emoji'))
        expect(screen.getByText('Popular')).toBeInTheDocument()
    })

    it('closes when clicking outside the picker', () => {
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        expect(screen.getByText('Popular')).toBeInTheDocument()
        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('Popular')).not.toBeInTheDocument()
    })

    it('stays open when clicking inside the picker', () => {
        render(<EmojiPicker value='' onChange={vi.fn()} guildId='g1' />)
        fireEvent.click(screen.getByText('Pick emoji'))
        fireEvent.mouseDown(screen.getByText('Popular'))
        expect(screen.getByText('Popular')).toBeInTheDocument()
    })
})
