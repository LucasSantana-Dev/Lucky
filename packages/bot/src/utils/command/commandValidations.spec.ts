import {
    GuildMemberRoleManager,
    PermissionFlagsBits,
    PermissionsBitField,
} from 'discord.js'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'

const getGuildSettingsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: {
        getGuildSettings: (...args: unknown[]) => getGuildSettingsMock(...args),
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    handleError: jest.fn(),
    createUserErrorMessage: jest.fn(() => 'error'),
    warnLog: jest.fn(),
}))

const interactionReplyMock = jest.fn()
jest.mock('../general/embeds', () => {
    const embed = (title: string, description: string) => ({
        data: { title, description },
    })
    return { errorEmbed: embed, createErrorEmbed: embed }
})
jest.mock('../general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))
jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction:
        async () => (key: string, options?: { channel?: string }) =>
            options?.channel === undefined ? key : `${key}|${options.channel}`,
}))

import type { GuildQueue } from 'discord-player'
import {
    requireDJRoleInGuild,
    requireSameVoiceChannel,
    voiceChannelRefusal,
} from './commandValidations'

function makeInteraction(
    overrides: Record<string, unknown> = {},
): ChatInputCommandInteraction {
    return {
        guildId: 'guild-1',
        member: {
            permissions: new PermissionsBitField(
                PermissionFlagsBits.ManageGuild,
            ),
        } as GuildMember,
        ...overrides,
    } as unknown as ChatInputCommandInteraction
}

function makeRoleManager(roleIds: string[]): GuildMemberRoleManager {
    const roleManager = Object.create(GuildMemberRoleManager.prototype)
    Object.defineProperty(roleManager, 'cache', {
        value: new Map(roleIds.map((id) => [id, {}])),
    })
    return roleManager as GuildMemberRoleManager
}

describe('requireDJRoleInGuild', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('rejects when the interaction has no guildId', async () => {
        const interaction = makeInteraction({ guildId: null })

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).rejects.toThrow(
            'assertDefined: Guild ID required after someCheck check',
        )
    })

    it('grants members with ManageGuild without consulting guild settings', async () => {
        const interaction = makeInteraction()

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).resolves.toBe(true)
        expect(getGuildSettingsMock).not.toHaveBeenCalled()
    })

    it('passes the resolved guildId to guild settings for a non-manager holding the DJ role', async () => {
        getGuildSettingsMock.mockResolvedValueOnce({ djRoleId: 'dj-role' })
        const interaction = makeInteraction({
            member: {
                permissions: new PermissionsBitField(),
                roles: makeRoleManager(['dj-role']),
            } as GuildMember,
        })

        await expect(
            requireDJRoleInGuild(interaction, 'someCheck'),
        ).resolves.toBe(true)
        expect(getGuildSettingsMock).toHaveBeenCalledWith('guild-1')
    })
})

function makeVoiceInteraction(
    userChannelId: string | null,
    botChannelId: string | null = null,
) {
    return {
        guildId: 'guild-1',
        commandName: 'stop',
        user: { id: 'user-1' },
        member: {
            voice: {
                channelId: userChannelId,
                channel: userChannelId ? { id: userChannelId } : null,
            },
        },
        guild: { members: { me: { voice: { channelId: botChannelId } } } },
        deferred: false,
        replied: false,
        deferReply: jest.fn().mockResolvedValue(undefined),
    }
}

function makeQueue(channelId: string | null): GuildQueue {
    return {
        channel: channelId ? { id: channelId } : null,
    } as unknown as GuildQueue
}

function asCommand(interaction: unknown): ChatInputCommandInteraction {
    return interaction as ChatInputCommandInteraction
}

describe('voiceChannelRefusal', () => {
    it('refuses a member who is in no voice channel', () => {
        const interaction = makeVoiceInteraction(null)

        expect(
            voiceChannelRefusal(asCommand(interaction), makeQueue('vc-bot')),
        ).toEqual({ reason: 'notInVoice' })
    })

    it('refuses a member in a different channel than the queue', () => {
        const interaction = makeVoiceInteraction('vc-other')

        expect(
            voiceChannelRefusal(asCommand(interaction), makeQueue('vc-bot')),
        ).toEqual({ reason: 'otherChannel', botChannelId: 'vc-bot' })
    })

    it('falls back to the bot voice state when no queue exists', () => {
        const interaction = makeVoiceInteraction('vc-other', 'vc-bot')

        expect(voiceChannelRefusal(asCommand(interaction), null)).toEqual({
            reason: 'otherChannel',
            botChannelId: 'vc-bot',
        })
    })

    it('allows a member in the same channel as the queue', () => {
        const interaction = makeVoiceInteraction('vc-bot')

        expect(
            voiceChannelRefusal(asCommand(interaction), makeQueue('vc-bot')),
        ).toBeNull()
    })

    it('allows any voice member when the bot is not connected', () => {
        const interaction = makeVoiceInteraction('vc-any')

        expect(voiceChannelRefusal(asCommand(interaction), null)).toBeNull()
    })
})

describe('requireSameVoiceChannel', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('replies ephemerally, deferring as ephemeral first, when outside the bot channel', async () => {
        const interaction = makeVoiceInteraction('vc-other')

        await expect(
            requireSameVoiceChannel(
                makeQueue('vc-bot'),
                asCommand(interaction),
            ),
        ).resolves.toBe(false)

        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 })
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const { content } = interactionReplyMock.mock.calls[0][0]
        expect(content.ephemeral).toBe(true)
        expect(content.embeds[0].data.description).toBe(
            'music.errors.notSameVoice|<#vc-bot>',
        )
        expect(content.embeds[0].data.title).toBe(
            'music.errors.notSameVoiceTitle',
        )
    })

    it('replies with the translated not-in-voice error when the member is in no channel', async () => {
        const interaction = makeVoiceInteraction(null)

        await expect(
            requireSameVoiceChannel(null, asCommand(interaction)),
        ).resolves.toBe(false)

        const { content } = interactionReplyMock.mock.calls[0][0]
        expect(content.ephemeral).toBe(true)
        expect(content.embeds[0].data.description).toBe(
            'music.errors.notInVoice',
        )
    })

    it('still refuses ephemerally when the ephemeral defer rejects', async () => {
        const interaction = makeVoiceInteraction('vc-other')
        interaction.deferReply.mockRejectedValueOnce(
            Object.assign(new Error('Unknown interaction'), { code: 10062 }),
        )

        await expect(
            requireSameVoiceChannel(
                makeQueue('vc-bot'),
                asCommand(interaction),
            ),
        ).resolves.toBe(false)

        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        expect(interactionReplyMock.mock.calls[0][0].content.ephemeral).toBe(
            true,
        )
    })

    it('does not defer again when the interaction is already acknowledged', async () => {
        const interaction = {
            ...makeVoiceInteraction('vc-other'),
            deferred: true,
        }

        await requireSameVoiceChannel(
            makeQueue('vc-bot'),
            asCommand(interaction),
        )

        expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('passes without replying when the member shares the bot channel', async () => {
        const interaction = makeVoiceInteraction('vc-bot')

        await expect(
            requireSameVoiceChannel(
                makeQueue('vc-bot'),
                asCommand(interaction),
            ),
        ).resolves.toBe(true)

        expect(interaction.deferReply).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })
})
