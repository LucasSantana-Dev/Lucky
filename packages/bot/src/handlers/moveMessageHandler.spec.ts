jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    captureException: jest.fn(),
}))

import { GuildPremiumTier, type Attachment } from 'discord.js'
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
