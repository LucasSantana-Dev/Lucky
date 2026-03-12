import {
    type Guild,
    ChannelType,
    type GuildBasedChannel,
    PermissionFlagsBits,
} from 'discord.js'
import {
    autoMessageService,
    autoModService,
    getModerationSettings,
    guildRoleAccessService,
    reactionRolesService,
    roleManagementService,
    onboardingToManifest,
    type GuildAutomationManifestDocument,
} from '@lucky/shared/services'

function isOnboardingNotConfiguredError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false
    }

    const status = Reflect.get(error, 'status')
    if (status === 404) {
        return true
    }

    const message = Reflect.get(error, 'message')
    return (
        typeof message === 'string' &&
        message.toLowerCase().includes('unknown guild onboarding')
    )
}

function normalizeAutoModSettings(
    value: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
    if (!value) {
        return undefined
    }

    return {
        enabled: value.enabled,
        spamEnabled: value.spamEnabled,
        spamThreshold: value.spamThreshold,
        spamTimeWindow: value.spamTimeWindow,
        capsEnabled: value.capsEnabled,
        capsThreshold: value.capsThreshold,
        linksEnabled: value.linksEnabled,
        allowedDomains: value.allowedDomains,
        invitesEnabled: value.invitesEnabled,
        wordsEnabled: value.wordsEnabled,
        bannedWords: value.bannedWords,
        exemptRoles: value.exemptRoles,
        exemptChannels: value.exemptChannels,
    }
}

function normalizeModerationSettings(
    value: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
    if (!value) {
        return undefined
    }

    return {
        modLogChannelId: value.modLogChannelId,
        muteRoleId: value.muteRoleId,
        modRoleIds: value.modRoleIds,
        adminRoleIds: value.adminRoleIds,
        autoModEnabled: value.autoModEnabled,
        maxWarnings: value.maxWarnings,
        warningExpiry: value.warningExpiry,
        dmOnAction: value.dmOnAction,
        requireReason: value.requireReason,
    }
}

function mapChannelType(type: ChannelType): string {
    return ChannelType[type] ?? String(type)
}

function isSupportedChannel(channel: GuildBasedChannel): boolean {
    return (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.GuildVoice ||
        channel.type === ChannelType.GuildCategory ||
        channel.type === ChannelType.GuildForum ||
        channel.type === ChannelType.GuildStageVoice
    )
}

function isReadonly(channel: GuildBasedChannel, guildId: string): boolean {
    if (!('permissionOverwrites' in channel)) {
        return false
    }

    const everyoneOverwrite = channel.permissionOverwrites.cache.get(guildId)
    if (!everyoneOverwrite) {
        return false
    }

    return everyoneOverwrite.deny.has(PermissionFlagsBits.SendMessages)
}

async function captureParity(guild: Guild, botUserId?: string) {
    const bots = [...guild.members.cache.values()]
        .filter((member) => member.user.bot && member.id !== botUserId)
        .map((member) => ({
            id: member.id,
            name: member.user.username,
            retireOnCutover: false,
        }))

    return {
        shadowMode: true,
        externalBots: bots,
        checklist: [
            {
                key: 'onboarding-native',
                label: 'Native onboarding is configured in Lucky manifest',
                done: false,
            },
            {
                key: 'moderation-parity',
                label: 'Moderation and automod parity verified',
                done: false,
            },
            {
                key: 'roles-parity',
                label: 'Roles/channels parity verified in shadow mode',
                done: false,
            },
            {
                key: 'external-bots-removed',
                label: 'Legacy bot permissions/invites removed',
                done: false,
            },
        ],
        cutoverReady: false,
    }
}

export async function captureGuildAutomationState(
    guild: Guild,
    botUserId?: string,
): Promise<GuildAutomationManifestDocument> {
    let onboarding = null
    try {
        onboarding = await guild.fetchOnboarding()
    } catch (error) {
        if (!isOnboardingNotConfiguredError(error)) {
            throw error
        }
    }

    const roles = [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id)
        .map((role) => ({
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            mentionable: role.mentionable,
            permissions: role.permissions.bitfield.toString(),
        }))

    const channels = [...guild.channels.cache.values()]
        .filter((channel) => isSupportedChannel(channel))
        .map((channel) => ({
            id: channel.id,
            name: channel.name,
            type: mapChannelType(channel.type),
            parentId: channel.parentId,
            topic: 'topic' in channel ? (channel.topic ?? null) : null,
            readonly: isReadonly(channel, guild.id),
        }))

    const [
        automodSettings,
        moderationSettings,
        welcomeMessage,
        leaveMessage,
        reactionRoleMessages,
        exclusiveRoles,
        roleGrants,
        parity,
    ] = await Promise.all([
        autoModService.getSettings(guild.id),
        getModerationSettings(guild.id),
        autoMessageService.getWelcomeMessage(guild.id),
        autoMessageService.getLeaveMessage(guild.id),
        reactionRolesService.listReactionRoleMessages(guild.id),
        roleManagementService.listExclusiveRoles(guild.id),
        guildRoleAccessService.listRoleGrants(guild.id),
        captureParity(guild, botUserId),
    ])

    return {
        version: 1,
        guild: {
            id: guild.id,
            name: guild.name,
        },
        onboarding: onboardingToManifest(guild.id, onboarding),
        roles: {
            roles,
            channels,
        },
        moderation: {
            automod: normalizeAutoModSettings(
                (automodSettings as Record<string, unknown> | null) ?? null,
            ),
            moderationSettings: normalizeModerationSettings(
                (moderationSettings as Record<string, unknown> | null) ?? null,
            ),
        },
        automessages: {
            welcome: welcomeMessage
                ? {
                      enabled: welcomeMessage.enabled,
                      channelId: welcomeMessage.channelId ?? undefined,
                      message: welcomeMessage.message ?? undefined,
                  }
                : undefined,
            leave: leaveMessage
                ? {
                      enabled: leaveMessage.enabled,
                      channelId: leaveMessage.channelId ?? undefined,
                      message: leaveMessage.message ?? undefined,
                  }
                : undefined,
        },
        reactionroles: {
            messages: reactionRoleMessages.map((message) => ({
                id: message.id,
                messageId: message.messageId,
                channelId: message.channelId,
                mappings: message.mappings.map((mapping) => ({
                    roleId: mapping.roleId,
                    label: mapping.label ?? mapping.roleId,
                    emoji: mapping.emoji ?? undefined,
                    style: mapping.style ?? undefined,
                })),
            })),
            exclusiveRoles: exclusiveRoles.map((item) => ({
                roleId: item.roleId,
                excludedRoleId: item.excludedRoleId,
            })),
        },
        commandaccess: {
            grants: roleGrants.map((grant) => ({
                roleId: grant.roleId,
                module: grant.module,
                mode: grant.mode,
            })),
        },
        parity,
        source: 'discord-capture',
        capturedAt: new Date().toISOString(),
    }
}
