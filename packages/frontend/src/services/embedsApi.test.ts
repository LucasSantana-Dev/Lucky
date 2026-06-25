import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import {
    createEmbedsApi,
    type CreateEmbedInput,
    type UpdateEmbedInput,
} from './embedsApi'

describe('embedsApi', () => {
    let mockClient: AxiosInstance
    let api: ReturnType<typeof createEmbedsApi>

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
        test('fetches embed templates for a guild', async () => {
            const guildId = 'guild-123'
            const mockTemplates = [
                {
                    id: 'embed-1',
                    guildId,
                    name: 'Welcome',
                    title: 'Welcome to the Server',
                    description: 'Please read the rules',
                    color: '#5865F2',
                    footer: 'Discord Bot',
                    thumbnail: null,
                    image: null,
                    fields: [],
                    useCount: 5,
                    createdBy: 'user-123',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                },
            ]
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { templates: mockTemplates },
            })

            const result = await api.list(guildId)

            expect(mockClient.get).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds`,
            )
            expect(result).toEqual(mockTemplates)
        })

        test('returns empty array when no templates exist', async () => {
            const guildId = 'guild-123'
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { templates: [] },
            })

            const result = await api.list(guildId)

            expect(mockClient.get).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds`,
            )
            expect(result).toEqual([])
        })

        test('constructs correct URL with guildId', async () => {
            const guildId = 'guild-999'
            vi.mocked(mockClient.get).mockResolvedValueOnce({
                data: { templates: [] },
            })

            await api.list(guildId)

            expect(mockClient.get).toHaveBeenCalledWith(
                '/guilds/guild-999/embeds',
            )
        })
    })

    describe('create', () => {
        test('creates an embed template with correct POST method and URL', async () => {
            const guildId = 'guild-123'
            const input: CreateEmbedInput = {
                name: 'Announcement',
                description: 'Announcement template',
                embedData: {
                    title: 'Important Announcement',
                    description: 'Read this carefully',
                    color: '#FF0000',
                    footer: 'Admin',
                    fields: [
                        {
                            name: 'Date',
                            value: '2024-01-01',
                            inline: true,
                        },
                    ],
                },
            }
            const mockResult = {
                id: 'embed-2',
                guildId,
                name: input.name,
                title: input.embedData.title || null,
                description: input.embedData.description || null,
                color: input.embedData.color || null,
                footer: input.embedData.footer || null,
                thumbnail: input.embedData.thumbnail || null,
                image: input.embedData.image || null,
                fields: input.embedData.fields || [],
                useCount: 0,
                createdBy: 'user-123',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: mockResult,
            })

            const result = await api.create(guildId, input)

            expect(mockClient.post).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds`,
                input,
            )
            expect(result).toEqual(mockResult)
        })

        test('sends correct POST URL with guildId', async () => {
            const guildId = 'guild-555'
            const input: CreateEmbedInput = {
                name: 'Test',
                embedData: {
                    title: 'Test Title',
                },
            }
            const mockResult = {
                id: 'embed-new',
                guildId,
                name: input.name,
                title: input.embedData.title || null,
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 0,
                createdBy: 'user-123',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }
            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: mockResult,
            })

            await api.create(guildId, input)

            expect(mockClient.post).toHaveBeenCalledWith(
                '/guilds/guild-555/embeds',
                input,
            )
        })

        test('passes CreateEmbedInput payload correctly', async () => {
            const guildId = 'guild-123'
            const input: CreateEmbedInput = {
                name: 'Custom Embed',
                description: 'A custom template',
                embedData: {
                    title: 'Title',
                    description: 'Description',
                    color: '#00FF00',
                    footer: 'Footer Text',
                    thumbnail: 'https://example.com/thumb.png',
                    image: 'https://example.com/image.png',
                    fields: [
                        {
                            name: 'Field 1',
                            value: 'Value 1',
                            inline: false,
                        },
                        {
                            name: 'Field 2',
                            value: 'Value 2',
                            inline: true,
                        },
                    ],
                },
            }
            const mockResult = {
                id: 'embed-custom',
                guildId,
                ...input,
                useCount: 0,
                createdBy: 'user-123',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            } as any

            vi.mocked(mockClient.post).mockResolvedValueOnce({
                data: mockResult,
            })

            await api.create(guildId, input)

            expect(mockClient.post).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds`,
                input,
            )
            const [, passedPayload] = vi.mocked(mockClient.post).mock.calls[0]
            expect(passedPayload).toEqual(input)
        })
    })

    describe('update', () => {
        test('updates an embed template with correct PATCH method', async () => {
            const guildId = 'guild-123'
            const name = 'Welcome'
            const input: UpdateEmbedInput = {
                title: 'Welcome Updated',
                color: '#00FF00',
            }
            const mockResult = {
                id: 'embed-1',
                guildId,
                name,
                title: input.title || null,
                description: 'Please read the rules',
                color: input.color || null,
                footer: 'Discord Bot',
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 5,
                createdBy: 'user-123',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-03T00:00:00Z',
            }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: mockResult,
            })

            const result = await api.update(guildId, name, input)

            expect(mockClient.patch).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds/${encodeURIComponent(name)}`,
                input,
            )
            expect(result).toEqual(mockResult)
        })

        test('encodes embed name in URL for special characters', async () => {
            const guildId = 'guild-123'
            const name = 'Special Name / & ?'
            const input: UpdateEmbedInput = {
                title: 'Updated',
            }
            const mockResult = {
                id: 'embed-special',
                guildId,
                name,
                title: input.title || null,
                description: null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 0,
                createdBy: 'user-123',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: mockResult,
            })

            await api.update(guildId, name, input)

            const encodedName = encodeURIComponent(name)
            expect(mockClient.patch).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds/${encodedName}`,
                input,
            )
        })

        test('handles embed names with spaces and slashes', async () => {
            const guildId = 'guild-456'
            const name = 'My Embed / Variant'
            const input: UpdateEmbedInput = {
                description: 'New description',
            }
            const mockResult = {
                id: 'embed-variant',
                guildId,
                name,
                title: null,
                description: input.description || null,
                color: null,
                footer: null,
                thumbnail: null,
                image: null,
                fields: [],
                useCount: 0,
                createdBy: 'user-456',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }
            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: mockResult,
            })

            await api.update(guildId, name, input)

            expect(mockClient.patch).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds/${encodeURIComponent(name)}`,
                input,
            )
        })

        test('passes UpdateEmbedInput payload correctly', async () => {
            const guildId = 'guild-123'
            const name = 'Embed'
            const input: UpdateEmbedInput = {
                title: 'New Title',
                description: 'New Description',
                color: '#FFFF00',
                footer: 'New Footer',
                thumbnail: 'https://example.com/thumb.png',
                image: 'https://example.com/image.png',
                fields: [
                    {
                        name: 'Updated Field',
                        value: 'Updated Value',
                        inline: true,
                    },
                ],
            }
            const mockResult = {
                id: 'embed-1',
                guildId,
                name,
                ...input,
                useCount: 10,
                createdBy: 'user-123',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            } as any

            vi.mocked(mockClient.patch).mockResolvedValueOnce({
                data: mockResult,
            })

            await api.update(guildId, name, input)

            const [, passedPayload] = vi.mocked(mockClient.patch).mock.calls[0]
            expect(passedPayload).toEqual(input)
        })
    })

    describe('delete', () => {
        test('deletes an embed template with correct DELETE method', async () => {
            const guildId = 'guild-123'
            const name = 'Welcome'
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete(guildId, name)

            expect(mockClient.delete).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds/${encodeURIComponent(name)}`,
            )
        })

        test('encodes embed name with special characters in DELETE URL', async () => {
            const guildId = 'guild-123'
            const name = 'Embed ? & # ='
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete(guildId, name)

            const encodedName = encodeURIComponent(name)
            expect(mockClient.delete).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds/${encodedName}`,
            )
        })

        test('constructs correct DELETE URL with guildId and encoded name', async () => {
            const guildId = 'guild-789'
            const name = 'Test Embed'
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete(guildId, name)

            expect(mockClient.delete).toHaveBeenCalledWith(
                '/guilds/guild-789/embeds/Test%20Embed',
            )
        })

        test('handles embed names with unicode characters', async () => {
            const guildId = 'guild-123'
            const name = 'Emoji 🎮 Embed'
            vi.mocked(mockClient.delete).mockResolvedValueOnce({})

            await api.delete(guildId, name)

            const encodedName = encodeURIComponent(name)
            expect(mockClient.delete).toHaveBeenCalledWith(
                `/guilds/${guildId}/embeds/${encodedName}`,
            )
        })
    })
})
