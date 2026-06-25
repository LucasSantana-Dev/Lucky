jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    captureException: jest.fn(),
}))

import {
    GuildPremiumTier,
    PermissionFlagsBits,
    type Attachment,
} from 'discord.js'
import {
    buildMoveEmbed,
    getUploadLimit,
    handleMoveMessageSelect,
    parseMoveCustomId,
    partitionAttachments,
} from './moveMessageHandler'
import { MOVE_MESSAGE_SELECT_PREFIX } from '../functions/moderation/contextMenus/moveMessage'
import type { CustomClient } from '../types'

const ONE_MB = 1024 * 1024

const makeAttachment = (over: Partial<Attachment>): Attachment =>
    ({
        name: 'file.png',
        url: 'https://cdn.example/file.png',
        size: ONE_MB,
        description: null,
        spoiler: false,
        ...over,
    }) as Attachment

describe('parseMoveCustomId', () => {
    it('decodes a well-formed customId', () => {
        expect(
            parseMoveCustomId(`${MOVE_MESSAGE_SELECT_PREFIX}111:222`),
        ).toEqual({ sourceChannelId: '111', messageId: '222' })
    })

    it('rejects a customId without the prefix', () => {
        expect(parseMoveCustomId('other:111:222')).toBeNull()
    })

    it('rejects a customId missing the message id', () => {
        expect(
            parseMoveCustomId(`${MOVE_MESSAGE_SELECT_PREFIX}111:`),
        ).toBeNull()
        expect(parseMoveCustomId(`${MOVE_MESSAGE_SELECT_PREFIX}111`)).toBeNull()
    })
})

describe('getUploadLimit', () => {
    it('returns the per-tier ceiling', () => {
        expect(getUploadLimit(GuildPremiumTier.None)).toBe(25 * ONE_MB)
        expect(getUploadLimit(GuildPremiumTier.Tier1)).toBe(25 * ONE_MB)
        expect(getUploadLimit(GuildPremiumTier.Tier2)).toBe(50 * ONE_MB)
        expect(getUploadLimit(GuildPremiumTier.Tier3)).toBe(100 * ONE_MB)
    })

    it('falls back to the base ceiling for an unknown tier', () => {
        expect(getUploadLimit(99 as GuildPremiumTier)).toBe(25 * ONE_MB)
    })
})

describe('partitionAttachments', () => {
    it('splits by the upload limit', () => {
        const small = makeAttachment({ name: 'small', size: 5 * ONE_MB })
        const big = makeAttachment({ name: 'big', size: 30 * ONE_MB })
        const { toUpload, tooLarge } = partitionAttachments(
            [small, big],
            25 * ONE_MB,
        )
        expect(toUpload).toEqual([small])
        expect(tooLarge).toEqual([big])
    })

    it('keeps an attachment exactly at the limit', () => {
        const exact = makeAttachment({ size: 25 * ONE_MB })
        const { toUpload, tooLarge } = partitionAttachments(
            [exact],
            25 * ONE_MB,
        )
        expect(toUpload).toHaveLength(1)
        expect(tooLarge).toHaveLength(0)
    })
})

describe('buildMoveEmbed', () => {
    const base = {
        author: {
            username: 'alice',
            displayAvatarURL: () => 'https://cdn/avatar.png',
        },
        createdAt: new Date('2026-06-21T12:00:00.000Z'),
        sourceChannelId: '999',
        moverTag: 'mod#0001',
        tooLarge: [] as Attachment[],
    }

    it('preserves author, content, source, footer and original timestamp', () => {
        const embed = buildMoveEmbed({ ...base, content: 'hello world' })
        expect(embed.data.author?.name).toBe('alice')
        expect(embed.data.author?.icon_url).toBe('https://cdn/avatar.png')
        expect(embed.data.description).toBe('hello world')
        expect(embed.data.fields?.[0]).toMatchObject({
            name: 'Originally posted in',
            value: '<#999>',
        })
        expect(embed.data.footer?.text).toBe('Moved by mod#0001')
        expect(embed.data.timestamp).toBe('2026-06-21T12:00:00.000Z')
    })

    it('substitutes a placeholder when the message has no text', () => {
        const embed = buildMoveEmbed({ ...base, content: '' })
        expect(embed.data.description).toBe('*(no text content)*')
    })

    it('adds a warning field listing attachments too large to move', () => {
        const big = makeAttachment({ name: 'huge.zip', size: 99 * ONE_MB })
        const embed = buildMoveEmbed({
            ...base,
            content: 'x',
            tooLarge: [big],
        })
        const warn = embed.data.fields?.find((f) =>
            f.name.includes('too large'),
        )
        expect(warn?.value).toContain('huge.zip')
        expect(warn?.value).toContain(big.url)
    })

    it('omits the warning field when nothing was too large', () => {
        const embed = buildMoveEmbed({ ...base, content: 'x' })
        expect(
            embed.data.fields?.some((f) => f.name.includes('too large')),
        ).toBe(false)
    })
})

describe('handleMoveMessageSelect guards', () => {
    const client = {} as CustomClient

    const makeInteraction = (over: Record<string, unknown>) => {
        const update = jest.fn().mockResolvedValue(undefined)
        const deferUpdate = jest.fn().mockResolvedValue(undefined)
        const interaction = {
            customId: `${MOVE_MESSAGE_SELECT_PREFIX}111:222`,
            values: ['333'],
            deferred: false,
            replied: false,
            user: { tag: 'mod#0001' },
            memberPermissions: {
                has: () => true,
            },
            guild: {
                id: 'g1',
                members: { me: {} },
                channels: { fetch: jest.fn() },
            },
            update,
            deferUpdate,
            editReply: jest.fn().mockResolvedValue(undefined),
            ...over,
        }
        return { interaction, update, deferUpdate }
    }

    it('refuses outside a guild and never defers (no destructive work)', async () => {
        const { interaction, update, deferUpdate } = makeInteraction({
            guild: null,
        })
        await handleMoveMessageSelect(interaction as never, client)
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({ components: [] }),
        )
        expect(deferUpdate).not.toHaveBeenCalled()
    })

    it('refuses when the member lacks Manage Messages', async () => {
        const { interaction, deferUpdate } = makeInteraction({
            memberPermissions: { has: () => false },
        })
        await handleMoveMessageSelect(interaction as never, client)
        expect(deferUpdate).not.toHaveBeenCalled()
    })

    it('refuses when destination equals source', async () => {
        const { interaction, update, deferUpdate } = makeInteraction({
            customId: `${MOVE_MESSAGE_SELECT_PREFIX}333:222`,
            values: ['333'],
        })
        await handleMoveMessageSelect(interaction as never, client)
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('different'),
                components: [],
            }),
        )
        expect(deferUpdate).not.toHaveBeenCalled()
    })

    it('refuses a malformed customId', async () => {
        const { interaction, deferUpdate } = makeInteraction({
            customId: 'garbage',
        })
        await handleMoveMessageSelect(interaction as never, client)
        expect(deferUpdate).not.toHaveBeenCalled()
    })
})

describe('handleMoveMessageSelect — full flow', () => {
    const client = {} as CustomClient
    const realFetch = global.fetch

    afterEach(() => {
        global.fetch = realFetch
    })

    const makeChannel = (over: Record<string, unknown> = {}) => ({
        guildId: 'g1',
        isTextBased: () => true,
        isThread: () => false,
        permissionsFor: () => ({ has: () => true }),
        messages: { fetch: jest.fn() },
        send: jest.fn().mockResolvedValue({ url: 'https://discord/x/1' }),
        ...over,
    })

    const makeMessage = (over: Record<string, unknown> = {}) => ({
        author: { username: 'alice', displayAvatarURL: () => 'http://a.png' },
        content: 'hello',
        createdAt: new Date('2026-06-21T00:00:00.000Z'),
        attachments: new Map(),
        delete: jest.fn().mockResolvedValue(undefined),
        ...over,
    })

    const makeFlow = (opts: {
        source?: ReturnType<typeof makeChannel>
        dest?: ReturnType<typeof makeChannel>
        premiumTier?: GuildPremiumTier
        customId?: string
        values?: string[]
    }) => {
        const source = opts.source ?? makeChannel()
        const dest = opts.dest ?? makeChannel()
        const editReply = jest.fn().mockResolvedValue(undefined)
        const update = jest.fn().mockResolvedValue(undefined)
        const interaction: Record<string, unknown> = {
            customId: opts.customId ?? `${MOVE_MESSAGE_SELECT_PREFIX}src:msg`,
            values: opts.values ?? ['dest'],
            deferred: false,
            replied: false,
            user: { tag: 'mod#0001' },
            memberPermissions: { has: () => true },
            editReply,
            update,
            guild: {
                id: 'g1',
                premiumTier: opts.premiumTier ?? GuildPremiumTier.None,
                members: { me: {} },
                channels: {
                    fetch: jest.fn(async (id: string) =>
                        id === 'src' ? source : dest,
                    ),
                },
            },
        }
        interaction.deferUpdate = jest.fn().mockImplementation(() => {
            interaction.deferred = true
            return Promise.resolve()
        })
        return { interaction, source, dest, editReply }
    }

    it('reposts then deletes on the happy path (no attachments)', async () => {
        const message = makeMessage()
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel()
        const { interaction, editReply } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(dest.send).toHaveBeenCalledTimes(1)
        expect(message.delete).toHaveBeenCalledTimes(1)
        expect(editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Moved to <#dest>'),
            }),
        )
    })

    it('re-uploads an attachment that fits the limit', async () => {
        const attachment = makeAttachment({ name: 'pic.png', size: ONE_MB })
        const message = makeMessage({
            attachments: new Map([['1', attachment]]),
        })
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel()
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
        }) as unknown as typeof fetch
        const { interaction } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(global.fetch).toHaveBeenCalledWith(
            attachment.url,
            expect.objectContaining({ signal: expect.anything() }),
        )
        const sendArg = (dest.send as jest.Mock).mock.calls[0][0]
        expect(sendArg.files).toHaveLength(1)
        expect(message.delete).toHaveBeenCalled()
    })

    it('refuses a destination channel from a different guild (IDOR guard)', async () => {
        const message = makeMessage()
        const source = makeChannel({
            guildId: 'g1',
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel({ guildId: 'g2' })
        const { interaction, editReply } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(dest.send).not.toHaveBeenCalled()
        expect(message.delete).not.toHaveBeenCalled()
        expect(editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('unavailable'),
                components: [],
            }),
        )
    })

    it('aborts without deleting when the bot lacks destination perms', async () => {
        const message = makeMessage()
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel({
            permissionsFor: () => ({ has: () => false }),
        })
        const { interaction, editReply } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(dest.send).not.toHaveBeenCalled()
        expect(message.delete).not.toHaveBeenCalled()
        expect(editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining("can't post"),
                components: [],
            }),
        )
    })

    it('requires Send Messages in Threads for a thread destination', async () => {
        const message = makeMessage()
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel({
            isThread: () => true,
            permissionsFor: () => ({
                has: (flag: bigint) =>
                    flag !== PermissionFlagsBits.SendMessagesInThreads,
            }),
        })
        const { interaction, editReply } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(dest.send).not.toHaveBeenCalled()
        expect(message.delete).not.toHaveBeenCalled()
        expect(editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('Send Messages in Threads'),
            }),
        )
    })

    it('does not require Attach Files when there are no attachments', async () => {
        const message = makeMessage() // empty attachments
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel({
            permissionsFor: () => ({
                has: (flag: bigint) => flag !== PermissionFlagsBits.AttachFiles,
            }),
        })
        const { interaction } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        // AttachFiles is missing but unneeded → the move still completes.
        expect(dest.send).toHaveBeenCalledTimes(1)
        expect(message.delete).toHaveBeenCalled()
    })

    it('aborts when the original message is gone', async () => {
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(null) },
        })
        const dest = makeChannel()
        const { interaction, editReply } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(dest.send).not.toHaveBeenCalled()
        expect(editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('no longer exists'),
            }),
        )
    })

    it('reports partial success when the original delete fails after repost', async () => {
        const message = makeMessage({
            delete: jest.fn().mockRejectedValue(new Error('no perms')),
        })
        const source = makeChannel({
            messages: { fetch: jest.fn().mockResolvedValue(message) },
        })
        const dest = makeChannel()
        const { interaction, editReply } = makeFlow({ source, dest })

        await handleMoveMessageSelect(interaction as never, client)

        expect(dest.send).toHaveBeenCalledTimes(1)
        expect(editReply).toHaveBeenLastCalledWith(
            expect.objectContaining({
                content: expect.stringContaining(
                    "couldn't delete the original",
                ),
            }),
        )
    })
})
