import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const getConfigMock = jest.fn()
const upsertEntryMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    starboardService: {
        getConfig: (...args: unknown[]) => getConfigMock(...args),
        upsertEntry: (...args: unknown[]) => upsertEntryMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

import { handleReactionEvents } from './reactionHandler'

function makeClient() {
    const handlers: Record<string, Function> = {}
    return {
        on: jest.fn((event: string, fn: Function) => {
            handlers[event] = fn
        }),
        channels: { fetch: jest.fn() },
        _handlers: handlers,
    }
}

function makeReaction(overrides: any = {}) {
    return {
        partial: false,
        fetch: jest.fn(),
        emoji: { name: '⭐' },
        count: 2,
        message: {
            partial: false,
            fetch: jest.fn(),
            guild: { id: 'guild-1' },
            id: 'msg-1',
            channelId: 'ch-1',
            author: {
                id: 'author-1',
                username: 'Author',
                tag: 'Author#0001',
                displayAvatarURL: () => 'http://x',
            },
            content: 'hello',
            channel: { name: 'general' },
            url: 'https://discord.com/msg',
        },
        ...overrides,
    }
}

function makeUser(id = 'user-1') {
    return { partial: false, fetch: jest.fn(), id, bot: false }
}

const DEFAULT_CONFIG = {
    channelId: 'starboard-ch',
    emoji: '⭐',
    threshold: 2,
    selfStar: false,
}

describe('handleReactionEvents', () => {
    let client: ReturnType<typeof makeClient>

    beforeEach(() => {
        jest.clearAllMocks()
        client = makeClient()
        handleReactionEvents(client as any)
    })

    it('registers MessageReactionAdd event handler', () => {
        expect(client.on).toHaveBeenCalledWith(
            'messageReactionAdd',
            expect.any(Function),
        )
    })

    it('does nothing when reaction is from a bot', async () => {
        getConfigMock.mockResolvedValue(DEFAULT_CONFIG)
        const reaction = makeReaction()
        const user = { ...makeUser(), bot: true }
        await client._handlers['messageReactionAdd'](reaction, user)
        expect(getConfigMock).not.toHaveBeenCalled()
    })

    it('does nothing when message has no guild', async () => {
        const reaction = makeReaction({
            message: { ...makeReaction().message, guild: null },
        })
        await client._handlers['messageReactionAdd'](reaction, makeUser())
        expect(getConfigMock).not.toHaveBeenCalled()
    })

    it('does nothing when no starboard config exists', async () => {
        getConfigMock.mockResolvedValue(null)
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(upsertEntryMock).not.toHaveBeenCalled()
    })

    it('does nothing when emoji does not match config', async () => {
        getConfigMock.mockResolvedValue({ ...DEFAULT_CONFIG, emoji: '💎' })
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(upsertEntryMock).not.toHaveBeenCalled()
    })

    it('does nothing when selfStar is false and author reacts to own message', async () => {
        getConfigMock.mockResolvedValue({ ...DEFAULT_CONFIG, selfStar: false })
        upsertEntryMock.mockResolvedValue({ starboardMsgId: null })
        const reaction = makeReaction()
        const user = makeUser('author-1')
        await client._handlers['messageReactionAdd'](reaction, user)
        expect(upsertEntryMock).not.toHaveBeenCalled()
    })

    it('upserts entry and does not post when below threshold', async () => {
        getConfigMock.mockResolvedValue({ ...DEFAULT_CONFIG, threshold: 5 })
        upsertEntryMock.mockResolvedValue({ starboardMsgId: null })
        const reaction = makeReaction({ count: 2 })
        await client._handlers['messageReactionAdd'](reaction, makeUser())
        expect(upsertEntryMock).toHaveBeenCalled()
        expect(client.channels.fetch).not.toHaveBeenCalled()
    })

    it('posts new starboard message when threshold reached and no prior post', async () => {
        getConfigMock.mockResolvedValue(DEFAULT_CONFIG)
        upsertEntryMock.mockResolvedValue({ starboardMsgId: null })
        const mockMsg = { id: 'posted-msg' }
        const mockChannel = {
            isTextBased: () => true,
            send: jest.fn().mockResolvedValue(mockMsg),
            messages: { fetch: jest.fn() },
        }
        client.channels.fetch = jest.fn().mockResolvedValue(mockChannel)
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(mockChannel.send).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) }),
        )
        expect(upsertEntryMock).toHaveBeenCalledTimes(2)
    })

    it('edits existing starboard message when threshold reached and post exists', async () => {
        getConfigMock.mockResolvedValue(DEFAULT_CONFIG)
        upsertEntryMock.mockResolvedValue({ starboardMsgId: 'existing-1' })
        const editMock = jest.fn().mockResolvedValue(undefined)
        const mockChannel = {
            isTextBased: () => true,
            send: jest.fn(),
            messages: {
                fetch: jest.fn().mockResolvedValue({ edit: editMock }),
            },
        }
        client.channels.fetch = jest.fn().mockResolvedValue(mockChannel)
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(editMock).toHaveBeenCalledWith(
            expect.objectContaining({ embeds: expect.any(Array) }),
        )
        expect(mockChannel.send).not.toHaveBeenCalled()
    })

    it('logs error when handler throws', async () => {
        getConfigMock.mockRejectedValue(new Error('DB fail'))
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('does not send when starboard channel is not text-based', async () => {
        getConfigMock.mockResolvedValue(DEFAULT_CONFIG)
        upsertEntryMock.mockResolvedValue({ starboardMsgId: null })
        const notTextChannel = { isTextBased: () => false, send: jest.fn() }
        client.channels.fetch = jest.fn().mockResolvedValue(notTextChannel)
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(notTextChannel.send).not.toHaveBeenCalled()
    })

    it('logs error when upsertEntry throws after posting to starboard', async () => {
        getConfigMock.mockResolvedValue(DEFAULT_CONFIG)
        upsertEntryMock.mockResolvedValue({ starboardMsgId: null })
        const postMock = jest.fn().mockResolvedValue({ id: 'star-msg-1' })
        const mockChannel = {
            isTextBased: () => true,
            send: postMock,
            messages: { fetch: jest.fn() },
        }
        client.channels.fetch = jest.fn().mockResolvedValue(mockChannel)
        upsertEntryMock
            .mockResolvedValueOnce({ starboardMsgId: null })
            .mockRejectedValueOnce(new Error('upsert failed'))
        await client._handlers['messageReactionAdd'](makeReaction(), makeUser())
        expect(postMock).toHaveBeenCalled()
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error handling reaction:' }),
        )
    })
})
