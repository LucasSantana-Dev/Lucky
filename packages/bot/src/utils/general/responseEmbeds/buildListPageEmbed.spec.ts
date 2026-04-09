import { describe, it, expect } from '@jest/globals'
import { buildListPageEmbed } from './buildListPageEmbed'

describe('buildListPageEmbed', () => {
    it('renders empty list with default message', () => {
        const embed = buildListPageEmbed([], 1, { title: 'Leaderboard' })
        expect(embed.data.description).toBe('No items to display.')
        expect(embed.data.footer?.text).toBe('Page 1 / 1')
    })

    it('renders empty list with custom message', () => {
        const embed = buildListPageEmbed([], 1, {
            title: 'Leaderboard',
            emptyMessage: 'No scores recorded.',
        })
        expect(embed.data.description).toBe('No scores recorded.')
    })

    it('renders first page with 10 items (default per page)', () => {
        const items = Array.from({ length: 25 }, (_, i) => ({
            name: `User ${i + 1}`,
            value: `Level ${i + 1}`,
        }))

        const embed = buildListPageEmbed(items, 1, { title: 'Leaderboard' })
        const fields = embed.data.fields ?? []

        expect(fields.length).toBe(10)
        expect(fields[0].name).toBe('User 1')
        expect(fields[9].name).toBe('User 10')
        expect(embed.data.footer?.text).toBe('Page 1 / 3')
    })

    it('renders last page with remaining items', () => {
        const items = Array.from({ length: 25 }, (_, i) => ({
            name: `User ${i + 1}`,
            value: `Level ${i + 1}`,
        }))

        const embed = buildListPageEmbed(items, 3, { title: 'Leaderboard' })
        const fields = embed.data.fields ?? []

        expect(fields.length).toBe(5)
        expect(fields[0].name).toBe('User 21')
        expect(fields[4].name).toBe('User 25')
        expect(embed.data.footer?.text).toBe('Page 3 / 3')
    })

    it('respects custom itemsPerPage setting', () => {
        const items = Array.from({ length: 25 }, (_, i) => ({
            name: `User ${i + 1}`,
            value: `Level ${i + 1}`,
        }))

        const embed = buildListPageEmbed(items, 1, {
            title: 'Leaderboard',
            itemsPerPage: 5,
        })
        const fields = embed.data.fields ?? []

        expect(fields.length).toBe(5)
        expect(embed.data.footer?.text).toBe('Page 1 / 5')
    })

    it('renders middle page correctly', () => {
        const items = Array.from({ length: 30 }, (_, i) => ({
            name: `Item ${i + 1}`,
            value: `Value ${i + 1}`,
        }))

        const embed = buildListPageEmbed(items, 2, {
            title: 'Items',
            itemsPerPage: 10,
        })
        const fields = embed.data.fields ?? []

        expect(fields.length).toBe(10)
        expect(fields[0].name).toBe('Item 11')
        expect(fields[9].name).toBe('Item 20')
        expect(embed.data.footer?.text).toBe('Page 2 / 3')
    })

    it('respects inline property on items', () => {
        const items = [
            { name: 'Inline Field', value: 'Value', inline: true },
            { name: 'Block Field', value: 'Value', inline: false },
        ]

        const embed = buildListPageEmbed(items, 1, { title: 'Test' })
        const fields = embed.data.fields ?? []

        expect(fields[0].inline).toBe(true)
        expect(fields[1].inline).toBe(false)
    })

    it('defaults inline to false when not specified', () => {
        const items = [{ name: 'Field', value: 'Value' }]

        const embed = buildListPageEmbed(items, 1, { title: 'Test' })
        const fields = embed.data.fields ?? []

        expect(fields[0].inline).toBe(false)
    })

    it('applies custom color to embed', () => {
        const embed = buildListPageEmbed([], 1, {
            title: 'Test',
            color: 0xff0000,
        })
        expect(embed.data.color).toBe(0xff0000)
    })

    it('uses default color when not specified', () => {
        const embed = buildListPageEmbed([], 1, { title: 'Test' })
        expect(embed.data.color).toBe(0x5865f2)
    })

    it('includes title in all embeds', () => {
        const embed = buildListPageEmbed([], 1, { title: 'Custom Title' })
        expect(embed.data.title).toBe('Custom Title')
    })

    it('includes timestamp in all embeds', () => {
        const embed = buildListPageEmbed([], 1, { title: 'Test' })
        expect(embed.data.timestamp).toBeDefined()
    })

    it('handles single item correctly', () => {
        const items = [{ name: 'Only Item', value: 'Value' }]
        const embed = buildListPageEmbed(items, 1, { title: 'Test' })

        expect(embed.data.fields?.length).toBe(1)
        expect(embed.data.footer?.text).toBe('Page 1 / 1')
    })
})
