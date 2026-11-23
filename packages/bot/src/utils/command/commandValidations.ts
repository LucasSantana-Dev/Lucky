import type {
    ChatInputCommandInteraction,
    EmbedBuilder,
    GuildMember,
} from 'discord.js'
import type { TFunction } from 'i18next'
import {
    GuildMemberRoleManager,
    PermissionsBitField,
    PermissionFlagsBits,
} from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { errorEmbed, createErrorEmbed } from '../general/embeds'
import { interactionReply } from '../general/interactionReply'
import {
    handleError,
    createUserErrorMessage,
    warnLog,
} from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'
import { assertDefined } from '@lucky/shared/utils/guards'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'

export async function requireGuild(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!interaction.guildId) {
        const error = handleError(
            new Error('Command can only be used in a guild/server'),
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireVoiceChannel(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    const member = interaction.member as GuildMember
    if (!member?.voice?.channel) {
        warnLog({
            message: 'requireVoiceChannel: user not in voice channel',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed('Not in Voice', 'Join a voice channel first.'),
                ],
                ephemeral: true,
            },
        })
        return false
    }
    return true
}

type VoiceGuardInteraction = {
    member: unknown
    memberPermissions?: Readonly<PermissionsBitField> | null
    guild?: {
        members?: { me?: { voice?: { channelId?: string | null } } | null }
    } | null
}

export type VoiceChannelRefusal =
    { reason: 'notInVoice' } | { reason: 'otherChannel'; botChannelId: string }

/** The voice channel the member is in, if any. */
function memberVoiceChannelId(member: unknown): string | null {
    const voice = (member as GuildMember | null)?.voice
    return voice?.channelId ?? voice?.channel?.id ?? null
}

function botVoiceChannelId(
    interaction: VoiceGuardInteraction,
    queue: GuildQueue | null,
): string | null {
    return (
        queue?.channel?.id ??
        interaction.guild?.members?.me?.voice?.channelId ??
        null
    )
}

/**
 * Manage Server, read from `memberPermissions` first: a raw or uncached
 * `member` carries its permissions as a bitfield string, not a bitfield.
 */
function canManageGuild(interaction: {
    member: unknown
    memberPermissions?: Readonly<PermissionsBitField> | null
}): boolean {
    const permissions =
        interaction.memberPermissions ??
        (interaction.member as GuildMember | null)?.permissions
    return (
        permissions instanceof PermissionsBitField &&
        permissions.has(PermissionFlagsBits.ManageGuild)
    )
}

/**
 * Why a member may not control the music, or null when they may. The bot's
 * channel comes from the queue, else from its own voice state; when the bot is
 * in no channel, any member in some voice channel passes (#3266). Members with
 * Manage Server pass from anywhere, so they can stop a session they are not in,
 * unless the caller sets `allowManagers: false` (ratings stay with listeners).
 */
export function voiceChannelRefusal(
    interaction: VoiceGuardInteraction,
    queue: GuildQueue | null,
    { allowManagers = true }: { allowManagers?: boolean } = {},
): VoiceChannelRefusal | null {
    if (allowManagers && canManageGuild(interaction)) return null

    const userChannelId = memberVoiceChannelId(interaction.member)
    if (!userChannelId) return { reason: 'notInVoice' }

    const botChannelId = botVoiceChannelId(interaction, queue)
    if (botChannelId && botChannelId !== userChannelId) {
        return { reason: 'otherChannel', botChannelId }
    }
    return null
}

export function voiceChannelRefusalEmbed(
    t: TFunction,
    refusal: VoiceChannelRefusal,
): EmbedBuilder {
    return refusal.reason === 'notInVoice'
        ? createErrorEmbed(
              t('music.errors.notInVoiceTitle'),
              t('music.errors.notInVoice'),
          )
        : createErrorEmbed(
              t('music.errors.notSameVoiceTitle'),
              t('music.errors.notSameVoice', {
                  channel: `<#${refusal.botChannelId}>`,
              }),
          )
}

/**
 * Music controls are for the members listening with the bot. Run before any
 * public defer: the refusal acknowledges ephemerally itself, ahead of the
 * translator lookup that can miss the language cache.
 */
export async function requireSameVoiceChannel(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    const refusal = voiceChannelRefusal(interaction, queue)
    if (!refusal) return true

    warnLog({
        message: `requireSameVoiceChannel: ${refusal.reason}`,
        data: {
            commandName: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId ?? undefined,
        },
    })

    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply({ flags: 64 })
        } catch {
            // interactionReply below records an expired interaction.
        }
    }
    const t = await translatorForInteraction(interaction)
    await interactionReply({
        interaction,
        content: {
            embeds: [voiceChannelRefusalEmbed(t, refusal)],
            ephemeral: true,
        },
    })
    return false
}

export async function requireQueue(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue) {
        warnLog({
            message: 'requireQueue: no active queue',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed(
                        'No Queue',
                        'No music is playing. Use /play to start.',
                    ),
                ],
            },
        })
        return false
    }
    return true
}

export async function requireCurrentTrack(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue?.currentTrack) {
        warnLog({
            message: 'requireCurrentTrack: no current track',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed('Not Playing', 'No track is currently playing.'),
                ],
                ephemeral: true,
            },
        })
        return false
    }
    return true
}

export async function requireIsPlaying(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue?.isPlaying()) {
        warnLog({
            message: 'requireIsPlaying: not playing',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed('Not Playing', 'No music is currently playing.'),
                ],
                ephemeral: true,
            },
        })
        return false
    }
    return true
}

export async function requireInteractionOptions(
    interaction: ChatInputCommandInteraction,
    options: string[],
) {
    if (!options.includes(interaction.options.getSubcommand() ?? '')) {
        const error = handleError(new Error('Invalid interaction option'), {
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user.id,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

/** A raw or uncached member lists its roles as an array of role ids. */
function memberHasRole(member: GuildMember, roleId: string): boolean {
    const roles = member.roles as GuildMemberRoleManager | string[] | undefined
    if (roles instanceof GuildMemberRoleManager) return roles.cache.has(roleId)
    return Array.isArray(roles) && roles.includes(roleId)
}

export async function requireDJRole(
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<boolean> {
    const member = interaction.member as GuildMember | null
    if (!member) return true

    if (canManageGuild(interaction)) return true

    const settings = await guildSettingsService.getGuildSettings(guildId)
    if (!settings?.djRoleId) return true

    const hasDJRole = memberHasRole(member, settings.djRoleId)

    if (!hasDJRole) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'DJ Only',
                        'This command is restricted to members with the DJ role.',
                    ),
                ],
                ephemeral: true,
            },
        })
    }
    return hasDJRole
}

export async function requireDJRoleInGuild(
    interaction: ChatInputCommandInteraction,
    checkLabel: string,
): Promise<boolean> {
    return requireDJRole(
        interaction,
        assertDefined(
            interaction.guildId,
            `Guild ID required after ${checkLabel} check`,
        ),
    )
}
