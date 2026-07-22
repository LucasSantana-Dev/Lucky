import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import { guildService, setBotClient } from '../../../src/services/GuildService'
import type { Client, Guild } from 'discord.js'

const originalFetch = global.fetch

describe('GuildService - getGuildEmojis', () => {
    let originalDiscordToken: string | undefined

    beforeEach(() => {
        jest.clearAllMocks()
        setBotClient(null)
        originalDiscordToken = process.env.DISCORD_TOKEN
        delete process.env.DISCORD_TOKEN
        global.fetch = originalFetch
    })

    afterEach(() => {
        if (originalDiscordToken === undefined) {
            delete process.env.DISCORD_TOKEN
        } else {
            process.env.DISCORD_TOKEN = originalDiscordToken
        }
        global.fetch = originalFetch
    })

    test('should return mapped emojis from bot client when available', async () => {
        const mockGuild = {
            id: '111111111111111111',
            emojis: {
                cache: new Map([
                    [
                        'emoji1',
                        {
                            id: 'emoji1',
                            name: 'happy',
                            animated: false,
                        },
                    ],
                    [
                        'emoji2',
                        {
                            id: 'emoji2',
                            name: 'sad',
                            animated: true,
                        },
                    ],
                    [
                        'emoji3',
                        {
                            id: 'emoji3',
                            name: 'love',
                            animated: false,
                        },
                    ],
                ]),
            },
        } as unknown as Guild

        const mockClient = {
            guilds: {
                cache: new Map([['111111111111111111', mockGuild]]),
                fetch: jest.fn(),
            },
        } as unknown as Client

        setBotClient(mockClient)

        const result = await guildService.getGuildEmojis('111111111111111111')

        expect(result).toEqual([
            { id: 'emoji1', name: 'happy', animated: false },
            { id: 'emoji2', name: 'sad', animated: true },
            { id: 'emoji3', name: 'love', animated: false },
        ])
        expect(mockClient.guilds.fetch).not.toHaveBeenCalled()
    })

    test('should fallback to Discord API for emojis when bot client is unavailable', async () => {
        process.env.DISCORD_TOKEN = 'test-bot-token'
        setBotClient(null)
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { id: 'emoji-a', name: 'cool', animated: false },
                { id: 'emoji-b', name: 'fire', animated: true },
                { id: 'emoji-c', name: 'party', animated: false },
            ],
        } as never) as unknown as typeof fetch

        const result = await guildService.getGuildEmojis('111111111111111111')

        expect(result).toEqual([
            { id: 'emoji-a', name: 'cool', animated: false },
            { id: 'emoji-b', name: 'fire', animated: true },
            { id: 'emoji-c', name: 'party', animated: false },
        ])
        expect(global.fetch).toHaveBeenCalledWith(
            'https://discord.com/api/v10/guilds/111111111111111111/emojis',
            {
                headers: {
                    Authorization: 'Bot test-bot-token',
                },
                signal: expect.any(AbortSignal),
            },
        )
    })

    test('should filter out entries without id on REST fallback', async () => {
        process.env.DISCORD_TOKEN = 'test-bot-token'
        setBotClient(null)
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { id: 'emoji-a', name: 'cool', animated: false },
                { name: 'invalid', animated: false }, // Missing id
                { id: 'emoji-b', name: 'fire', animated: true },
            ],
        } as never) as unknown as typeof fetch

        const result = await guildService.getGuildEmojis('111111111111111111')

        expect(result).toEqual([
            { id: 'emoji-a', name: 'cool', animated: false },
            { id: 'emoji-b', name: 'fire', animated: true },
        ])
    })

    test('should throw on REST API error', async () => {
        process.env.DISCORD_TOKEN = 'test-bot-token'
        setBotClient(null)
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => 'Not Found',
        } as never) as unknown as typeof fetch

        await expect(
            guildService.getGuildEmojis('111111111111111111'),
        ).rejects.toThrow('Discord API error: 404')
    })

    test('should throw on fetch network error', async () => {
        process.env.DISCORD_TOKEN = 'test-bot-token'
        setBotClient(null)
        global.fetch = jest
            .fn<typeof fetch>()
            .mockRejectedValue(new Error('Network error'))

        await expect(
            guildService.getGuildEmojis('111111111111111111'),
        ).rejects.toThrow('Network error')
    })

    test('should return empty array when no bot client and no token', async () => {
        setBotClient(null)
        // no token set

        const result = await guildService.getGuildEmojis('111111111111111111')

        expect(result).toEqual([])
    })

    test('should return empty array from bot client when guild has no emojis', async () => {
        const mockGuild = {
            id: '111111111111111111',
            emojis: {
                cache: new Map([]),
            },
        } as unknown as Guild

        const mockClient = {
            guilds: {
                cache: new Map([['111111111111111111', mockGuild]]),
            },
        } as unknown as Client

        setBotClient(mockClient)

        const result = await guildService.getGuildEmojis('111111111111111111')

        expect(result).toEqual([])
    })
})
