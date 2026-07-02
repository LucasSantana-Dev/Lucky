import {
    jest,
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
} from '@jest/globals'

const parseURLMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const featureToggleMock = jest.fn()
const findUniqueMock = jest.fn()
const createMock = jest.fn()
const subFindManyMock = jest.fn()
const subFindUniqueMock = jest.fn()
const subCreateMock = jest.fn()
const subUpdateMock = jest.fn()

jest.mock(
    'rss-parser',
    () =>
        function Parser() {
            return { parseURL: (...args: unknown[]) => parseURLMock(...args) }
        },
)

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: (...args: unknown[]) => featureToggleMock(...args),
    },
}))

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        rssDiscoveredGuide: {
            findUnique: (...args: unknown[]) => findUniqueMock(...args),
            create: (...args: unknown[]) => createMock(...args),
        },
        rssFeedSubscription: {
            findMany: (...args: unknown[]) => subFindManyMock(...args),
            findUnique: (...args: unknown[]) => subFindUniqueMock(...args),
            create: (...args: unknown[]) => subCreateMock(...args),
            update: (...args: unknown[]) => subUpdateMock(...args),
        },
    }),
}))

import { startRssBridgeService, stopRssBridgeService } from './RssBridgeService'

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
    isTextBased: () => true,
    send: jest.fn().mockResolvedValue(undefined as never),
    ...overrides,
})

const makeClient = (channel: unknown = makeChannel()) => ({
    channels: {
        fetch: jest.fn().mockResolvedValue(channel as never),
    },
})

const makeFeedItem = (overrides: Record<string, unknown> = {}) => ({
    title: 'Guide Title',
    link: 'https://criativaria.com.br/guias/my-guide',
    description: 'Short description',
    ...overrides,
})

beforeEach(() => {
    parseURLMock.mockReset()
    debugLogMock.mockReset()
    errorLogMock.mockReset()
    infoLogMock.mockReset()
    featureToggleMock.mockReset()
    findUniqueMock.mockReset()
    createMock.mockReset()

    featureToggleMock.mockResolvedValue(true)
    findUniqueMock.mockResolvedValue(null)
    createMock.mockResolvedValue({ slug: 'my-guide', title: 'Guide Title' })
    subFindManyMock.mockReset()
    subFindUniqueMock.mockReset()
    subCreateMock.mockReset()
    subUpdateMock.mockReset()
    subFindUniqueMock.mockResolvedValue({ id: 'sub-1' })
    subUpdateMock.mockResolvedValue({})
    subFindManyMock.mockResolvedValue([
        {
            id: 'sub-1',
            guildId: 'guild-1',
            feedUrl: 'https://criativaria.com.br/rss.xml',
            channelId: 'channel-123',
            mentionRoleId: null,
            lastItemGuid: null,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ])
    process.env.CRIATIVARIA_GUIDES_CHANNEL_ID = 'channel-123'
})

afterEach(() => {
    stopRssBridgeService()
    delete process.env.CRIATIVARIA_GUIDES_CHANNEL_ID
})

describe('startRssBridgeService', () => {
    it('returns early when feature flag disabled', async () => {
        featureToggleMock.mockResolvedValue(false)
        await startRssBridgeService(makeClient() as never)

        expect(parseURLMock).not.toHaveBeenCalled()
        expect(errorLogMock).not.toHaveBeenCalled()
        expect(infoLogMock).not.toHaveBeenCalled()
    })

    it('debugLogs and skips polling when no subscriptions exist', async () => {
        subFindManyMock.mockResolvedValue([])
        await startRssBridgeService(makeClient() as never)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('No RSS feed subscriptions'),
            }),
        )
        expect(parseURLMock).not.toHaveBeenCalled()
    })

    it('errorLogs feed errors internally without failing startup', async () => {
        parseURLMock.mockRejectedValue(new Error('network error') as never)
        await startRssBridgeService(makeClient() as never)

        // pollRssFeed has its own try-catch — error is swallowed there, not at startup
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error polling RSS feed' }),
        )
        // Startup succeeds despite the poll error (infoLog still fires)
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('started'),
            }),
        )
    })

    it('logs startup message and begins polling on happy path', async () => {
        parseURLMock.mockResolvedValue({ items: [] } as never)
        await startRssBridgeService(makeClient() as never)

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('started'),
            }),
        )
        expect(parseURLMock).toHaveBeenCalledTimes(1)
    })
})

describe('stopRssBridgeService', () => {
    it('is a no-op when no interval is running', () => {
        expect(() => stopRssBridgeService()).not.toThrow()
        expect(infoLogMock).not.toHaveBeenCalled()
    })

    it('clears the interval and logs when service is running', async () => {
        parseURLMock.mockResolvedValue({ items: [] } as never)
        await startRssBridgeService(makeClient() as never)
        infoLogMock.mockClear()

        stopRssBridgeService()

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('stopped'),
            }),
        )
    })

    it('is a no-op when called twice', async () => {
        parseURLMock.mockResolvedValue({ items: [] } as never)
        await startRssBridgeService(makeClient() as never)
        stopRssBridgeService()
        infoLogMock.mockClear()

        stopRssBridgeService()

        expect(infoLogMock).not.toHaveBeenCalled()
    })
})

describe('RSS feed polling', () => {
    it('debugLogs and returns when feed has no items', async () => {
        parseURLMock.mockResolvedValue({ items: [] } as never)
        await startRssBridgeService(makeClient() as never)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('No items'),
            }),
        )
        expect(findUniqueMock).not.toHaveBeenCalled()
    })

    it('errorLogs when channel is not text-based', async () => {
        const nonTextChannel = { isTextBased: () => false }
        parseURLMock.mockResolvedValue({ items: [makeFeedItem()] } as never)
        await startRssBridgeService(makeClient(nonTextChannel) as never)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('not a text channel'),
            }),
        )
        expect(findUniqueMock).not.toHaveBeenCalled()
    })

    it('errorLogs when channel lacks send method', async () => {
        const channelNoSend = { isTextBased: () => true }
        parseURLMock.mockResolvedValue({ items: [makeFeedItem()] } as never)
        await startRssBridgeService(makeClient(channelNoSend) as never)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('not a text channel'),
            }),
        )
    })

    it('debugLogs and skips items with no link or guid', async () => {
        parseURLMock.mockResolvedValue({
            items: [makeFeedItem({ link: undefined, guid: undefined })],
        } as never)
        await startRssBridgeService(makeClient() as never)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Could not extract GUID'),
            }),
        )
        expect(findUniqueMock).not.toHaveBeenCalled()
    })

    it('falls back to the raw link as dedup key for unparseable links', async () => {
        const channel = makeChannel()
        parseURLMock.mockResolvedValue({
            items: [makeFeedItem({ link: 'not-a-url' })],
        } as never)
        await startRssBridgeService(makeClient(channel) as never)

        // Unparseable URL → extractSlug null → the raw link becomes the key
        expect(findUniqueMock).toHaveBeenCalledWith(
            expect.objectContaining({ where: { slug: 'not-a-url' } }),
        )
        expect(channel.send).toHaveBeenCalled()
    })

    it('debugLogs and skips items already in DB', async () => {
        findUniqueMock.mockResolvedValue({ slug: 'my-guide' })
        parseURLMock.mockResolvedValue({ items: [makeFeedItem()] } as never)
        await startRssBridgeService(makeClient() as never)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('already posted'),
            }),
        )
        expect(createMock).not.toHaveBeenCalled()
    })

    it('creates DB record and sends Discord embed for new item', async () => {
        const channel = makeChannel()
        parseURLMock.mockResolvedValue({ items: [makeFeedItem()] } as never)
        await startRssBridgeService(makeClient(channel) as never)

        expect(createMock).toHaveBeenCalledWith({
            data: { slug: 'my-guide', title: 'Guide Title' },
        })
        expect(channel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        title: 'Guide Title',
                        url: 'https://criativaria.com.br/guias/my-guide',
                    }),
                ]),
            }),
        )
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('posted'),
            }),
        )
    })

    it('uses content when description is absent', async () => {
        const channel = makeChannel()
        parseURLMock.mockResolvedValue({
            items: [
                makeFeedItem({
                    description: undefined,
                    content: 'Content text',
                }),
            ],
        } as never)
        await startRssBridgeService(makeClient(channel) as never)

        expect(channel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.objectContaining({ description: 'Content text' }),
                ]),
            }),
        )
    })

    it('falls back to "Untitled" when item has no title', async () => {
        const channel = makeChannel()
        parseURLMock.mockResolvedValue({
            items: [makeFeedItem({ title: undefined })],
        } as never)
        await startRssBridgeService(makeClient(channel) as never)

        expect(channel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.objectContaining({ title: 'Untitled' }),
                ]),
            }),
        )
    })

    it('truncates description longer than 150 characters', async () => {
        const channel = makeChannel()
        const longDesc = 'A'.repeat(200)
        parseURLMock.mockResolvedValue({
            items: [makeFeedItem({ description: longDesc })],
        } as never)
        await startRssBridgeService(makeClient(channel) as never)

        const embed = (channel.send as jest.Mock).mock.calls[0] as [
            { embeds: { description: string }[] },
        ]
        const description = embed[0].embeds[0].description
        expect(description.length).toBeLessThanOrEqual(150)
        expect(description.endsWith('…')).toBe(true)
    })

    it('does not truncate description 150 characters or shorter', async () => {
        const channel = makeChannel()
        const desc = 'B'.repeat(150)
        parseURLMock.mockResolvedValue({
            items: [makeFeedItem({ description: desc })],
        } as never)
        await startRssBridgeService(makeClient(channel) as never)

        const embed = (channel.send as jest.Mock).mock.calls[0] as [
            { embeds: { description: string }[] },
        ]
        expect(embed[0].embeds[0].description).toBe(desc)
    })

    it('errorLogs per item when DB create fails and continues to next item', async () => {
        const channel = makeChannel()
        const item1 = makeFeedItem({
            link: 'https://criativaria.com.br/guias/guide-1',
        })
        const item2 = makeFeedItem({
            link: 'https://criativaria.com.br/guias/guide-2',
            title: 'Guide 2',
        })
        createMock
            .mockRejectedValueOnce(new Error('DB error') as never)
            .mockResolvedValueOnce({ slug: 'guide-2' } as never)
        parseURLMock.mockResolvedValue({ items: [item1, item2] } as never)

        await startRssBridgeService(makeClient(channel) as never)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to post'),
            }),
        )
        // Second item should still be processed
        expect(createMock).toHaveBeenCalledTimes(2)
    })

    it('processes multiple new items in sequence', async () => {
        const channel = makeChannel()
        const items = [
            makeFeedItem({
                link: 'https://criativaria.com.br/guias/guide-a',
                title: 'Guide A',
            }),
            makeFeedItem({
                link: 'https://criativaria.com.br/guias/guide-b',
                title: 'Guide B',
            }),
        ]
        parseURLMock.mockResolvedValue({ items } as never)

        await startRssBridgeService(makeClient(channel) as never)

        expect(createMock).toHaveBeenCalledTimes(2)
        expect(channel.send).toHaveBeenCalledTimes(2)
    })

    describe('Per-guild RSS subscriptions', () => {
        const sub = (mentionRoleId: string | null) => ({
            id: 'sub1',
            guildId: 'guild1',
            feedUrl: 'https://example.com/rss.xml',
            channelId: 'channel1',
            mentionRoleId,
            lastItemGuid: null,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        it('sends RSS item with role mention when mentionRoleId is set', async () => {
            subFindManyMock.mockResolvedValue([sub('role1')])
            parseURLMock.mockResolvedValue({
                items: [makeFeedItem({ guid: 'guid-1' })],
            } as never)
            const channel = makeChannel()
            await startRssBridgeService(makeClient(channel) as never)

            expect(channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '<@&role1>',
                    allowedMentions: { roles: ['role1'] },
                }),
            )
        })

        it('sends no mention when mentionRoleId is not set', async () => {
            subFindManyMock.mockResolvedValue([sub(null)])
            parseURLMock.mockResolvedValue({
                items: [makeFeedItem({ guid: 'guid-1' })],
            } as never)
            const channel = makeChannel()
            await startRssBridgeService(makeClient(channel) as never)

            expect(channel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: undefined,
                    allowedMentions: undefined,
                }),
            )
        })
    })
})
