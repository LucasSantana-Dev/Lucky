import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createEmbedsApi } from './embedsApi'

describe('createEmbedsApi', () => {
    let mockClient: AxiosInstance
    let api: ReturnType<typeof createEmbedsApi>

    const EMBED_TEMPLATE = {
        id: 'embed-1',
        guildId: 'g1',
        name: 'Welcome',
        title: 'Welcome to Server',
        description: 'Welcome message',
        color: '#5865F2',
        footer: 'Powered by Lucky',
        thumbnail: 'https://example.com/thumb.png',
        image: 'https://example.com/img.png',
        fields: [{ name: 'Field 1', value: 'Value 1' }],
        useCount: 5,
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
    }

    beforeEach(() => {
        mockClient = {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        } as unknown as AxiosInstance
        api = createEmbedsApi(mockClient)
    })

    describe('list', () => {
        test('returns embed templates on success', async () => {
            const templates = [EMBED_TEMPLATE]
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { templates },
            })

            const result = await api.list('g1')

            expect(mockClient.get).toHaveBeenCalledWith('/guilds/g1/embeds')
            expect(result).toEqual(templates)
        })

        test('returns empty array when no templates', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { templates: [] },
            })

            const result = await api.list('g1')

            expect(result).toEqual([])
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { templates: [] },
            })

            await api.list('guild-123')

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-123/embeds',
            )
        })
    })

    describe('create', () => {
        test('creates embed template on success', async () => {
            const input = {
                name: 'Welcome',
                description: 'Welcome embed',
                embedData: {
                    title: 'Welcome to Server',
                    description: 'Welcome message',
                },
            }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: EMBED_TEMPLATE,
            })

            const result = await api.create('g1', input)

            expect(mockClient.post).toHaveBeenCalledWith(
                '/guilds/g1/embeds',
                input,
            )
            expect(result).toEqual(EMBED_TEMPLATE)
        })

        test('passes correct guildId in URL', async () => {
            const input = { name: 'Test', embedData: {} }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: EMBED_TEMPLATE,
            })

            await api.create('guild-456', input)

            expect(mockClient.post).toHaveBeenCalledWith(
                '/guilds/guild-456/embeds',
                expect.anything(),
            )
        })
    })

    describe('update', () => {
        test('updates embed template on success', async () => {
            const input = { title: 'Updated Title' }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: { ...EMBED_TEMPLATE, ...input },
            })

            const result = await api.update('g1', 'Welcome', input)

            expect(mockClient.patch).toHaveBeenCalledWith(
                '/guilds/g1/embeds/Welcome',
                input,
            )
            expect(result.title).toBe('Updated Title')
        })

        test('encodes embed name with special characters', async () => {
            const input = { title: 'New Title' }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: EMBED_TEMPLATE,
            })

            await api.update('g1', 'Welcome & Rules', input)

            expect(mockClient.patch).toHaveBeenCalledWith(
                '/guilds/g1/embeds/Welcome%20%26%20Rules',
                input,
            )
        })

        test('passes correct guildId in URL', async () => {
            const input = { title: 'Updated' }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: EMBED_TEMPLATE,
            })

            await api.update('guild-patch', 'TestEmbed', input)

            expect(mockClient.patch).toHaveBeenCalledWith(
                '/guilds/guild-patch/embeds/TestEmbed',
                expect.anything(),
            )
        })
    })

    describe('delete', () => {
        test('deletes embed template on success', async () => {
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete('g1', 'Welcome')

            expect(mockClient.delete).toHaveBeenCalledWith(
                '/guilds/g1/embeds/Welcome',
            )
        })

        test('encodes embed name in URL with special characters', async () => {
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete('g1', 'Welcome & Rules')

            expect(mockClient.delete).toHaveBeenCalledWith(
                '/guilds/g1/embeds/Welcome%20%26%20Rules',
            )
        })

        test('passes correct guildId in URL', async () => {
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete('guild-del', 'MyEmbed')

            expect(mockClient.delete).toHaveBeenCalledWith(
                '/guilds/guild-del/embeds/MyEmbed',
            )
        })

        test('returns void on success', async () => {
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            const result = await api.delete('g1', 'Test')

            expect(result).toBeUndefined()
        })
    })
})
