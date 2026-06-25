// Mocks FIRST — before any imports
const mockUpsert = jest.fn()
const mockGetPrismaClient = jest.fn(() => ({
    guildForumThread: { upsert: mockUpsert },
}))
const mockErrorLog = jest.fn()
const mockInfoLog = jest.fn()

// The bot jest config maps @lucky/shared/utils/database/prismaClient to a manual
// mock. Override that with our own factory so getPrismaClient returns a stub client.
jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: mockGetPrismaClient,
    errorLog: mockErrorLog,
    infoLog: mockInfoLog,
    debugLog: jest.fn(),
}))

import { describe, expect, it, beforeEach } from '@jest/globals'
import { ChannelType, Events } from 'discord.js'
import {
    extractOfficialSlug,
    processForumThread,
    handleForumThreadCreate,
} from './forumThreadHandler'

// ---------- extractOfficialSlug unit tests ----------

describe('extractOfficialSlug', () => {
    it('extracts slug from a well-formed marker', () => {
        expect(
            extractOfficialSlug(
                'Intro\n<!-- official:v1:my-guide-slug -->\nbody',
            ),
        ).toBe('my-guide-slug')
    })

    it('tolerates extra whitespace inside the comment', () => {
        expect(extractOfficialSlug('<!--  official:v1:slug-abc   -->')).toBe(
            'slug-abc',
        )
    })

    it('returns null when no marker is present', () => {
        expect(extractOfficialSlug('No marker here')).toBeNull()
    })

    it('returns null for wrong version prefix', () => {
        expect(extractOfficialSlug('<!-- official:v2:some-slug -->')).toBeNull()
    })

    it('returns null for empty content', () => {
        expect(extractOfficialSlug('')).toBeNull()
    })
})

// ---------- processForumThread tests ----------

describe('processForumThread', () => {
    const BOT_ID = 'BOT_111'

    function makeThread(
        overrides: Partial<{
            guildId: string | null
            id: string
            name: string
            parentType: ChannelType
            starterContent: string
            starterThrows: boolean
            starterAuthorId: string
            botId: string
        }> = {},
    ) {
        const opts = {
            guildId: '895505900016631839',
            id: 'THREAD_123',
            name: 'Guide Thread',
            parentType: ChannelType.GuildForum,
            starterContent: '<!-- official:v1:my-guide --> some body',
            starterThrows: false,
            starterAuthorId: BOT_ID,
            botId: BOT_ID,
            ...overrides,
        }
        return {
            guildId: opts.guildId,
            id: opts.id,
            name: opts.name,
            parent: { type: opts.parentType },
            client: { user: { id: opts.botId } },
            fetchStarterMessage: jest.fn(async () =>
                opts.starterThrows
                    ? Promise.reject(new Error('forbidden'))
                    : {
                          content: opts.starterContent,
                          author: { id: opts.starterAuthorId },
                      },
            ),
        }
    }

    beforeEach(() => {
        jest.clearAllMocks()
        mockUpsert.mockResolvedValue({})
        mockGetPrismaClient.mockReturnValue({
            guildForumThread: { upsert: mockUpsert },
        })
    })

    it('upserts a GuildForumThread record when marker is found', async () => {
        await processForumThread(makeThread() as never)

        expect(mockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    guildId_slug: {
                        guildId: '895505900016631839',
                        slug: 'my-guide',
                    },
                },
                create: expect.objectContaining({
                    guildId: '895505900016631839',
                    threadId: 'THREAD_123',
                    slug: 'my-guide',
                    title: 'Guide Thread',
                    archived: false,
                }),
            }),
        )
        expect(mockInfoLog).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'forum thread mapped' }),
        )
    })

    it('ignores the official marker when the starter was not authored by the bot', async () => {
        await processForumThread(
            makeThread({ starterAuthorId: 'RANDOM_USER_999' }) as never,
        )
        expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('does nothing when parent is not a forum channel', async () => {
        await processForumThread(
            makeThread({ parentType: ChannelType.GuildText }) as never,
        )
        expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('does nothing when thread has no guildId', async () => {
        await processForumThread(makeThread({ guildId: null }) as never)
        expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('does nothing when starter message has no marker', async () => {
        await processForumThread(
            makeThread({ starterContent: 'Just a regular post' }) as never,
        )
        expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('does nothing when fetchStarterMessage throws (e.g. missing permissions)', async () => {
        await processForumThread(makeThread({ starterThrows: true }) as never)
        expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('logs an error and does not throw when upsert fails', async () => {
        mockUpsert.mockRejectedValue(new Error('db down'))
        await expect(
            processForumThread(makeThread() as never),
        ).resolves.toBeUndefined()
        expect(mockErrorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'failed to upsert forum thread mapping',
            }),
        )
    })
})

// ---------- handleForumThreadCreate wiring test ----------

describe('handleForumThreadCreate', () => {
    it('registers a ThreadCreate listener on the client', () => {
        const onMock = jest.fn()
        handleForumThreadCreate({ on: onMock } as never)
        expect(onMock).toHaveBeenCalledWith(
            Events.ThreadCreate,
            expect.any(Function),
        )
    })
})
