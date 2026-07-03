import {
    Events,
    EmbedBuilder,
    type Client,
    type Message,
    type PartialMessage,
    type Guild,
    type GuildChannel,
    type GuildMember,
    type PartialGuildMember,
    type Role,
    type GuildBan,
    type User,
    type PartialUser,
    type DMChannel,
    type NonThreadGuildBasedChannel,
    AuditLogEvent,
} from 'discord.js'
import { serverLogService, featureToggleService } from '@lucky/shared/services'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { postToModLog } from '../functions/moderation/helpers/modLogPoster.js'

async function isServerLogsEnabled(guildId: string): Promise<boolean> {
    return featureToggleService.isEnabled('SERVER_LOGS', { guildId })
}

function moderatorField(executor: User | PartialUser | null | undefined) {
    return {
        name: 'Moderator',
        value: executor ? `${executor.tag} (${executor.id})` : 'Unknown',
        inline: true as const,
    }
}

async function handleMessageDelete(
    message: Message<boolean> | PartialMessage<boolean>,
): Promise<void> {
    if (!message.guild || message.author?.bot) return
    if (!(await isServerLogsEnabled(message.guild.id))) return

    try {
        await serverLogService.createLog(
            message.guild.id,
            'message_delete',
            'Message deleted',
            {
                content: message.content?.substring(0, 500) || '[No content]',
                authorId: message.author?.id,
                authorTag: message.author?.tag,
            },
            {
                userId: message.author?.id,
                channelId: message.channelId,
            },
        )

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🗑️ Message Deleted')
            .addFields(
                {
                    name: 'Author',
                    value: `${message.author?.tag ?? 'Unknown'} (${message.author?.id ?? '?'})`,
                    inline: true,
                },
                {
                    name: 'Channel',
                    value: `<#${message.channelId}>`,
                    inline: true,
                },
                {
                    name: 'Content',
                    value:
                        message.content?.substring(0, 1000) || '[No content]',
                },
            )
            .setTimestamp()
        await postToModLog(message.guild, embed)

        debugLog({
            message: `Logged message delete in ${message.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging message delete:',
            error,
        })
    }
}

async function handleMessageUpdate(
    oldMessage: Message<boolean> | PartialMessage<boolean>,
    newMessage: Message<boolean> | PartialMessage<boolean>,
): Promise<void> {
    if (!newMessage.guild || newMessage.author?.bot) return
    if (oldMessage.content === newMessage.content) return
    if (!(await isServerLogsEnabled(newMessage.guild.id))) return

    try {
        await serverLogService.createLog(
            newMessage.guild.id,
            'message_edit',
            'Message edited',
            {
                oldContent:
                    oldMessage.content?.substring(0, 500) || '[No content]',
                newContent:
                    newMessage.content?.substring(0, 500) || '[No content]',
                authorId: newMessage.author?.id,
                authorTag: newMessage.author?.tag,
            },
            {
                userId: newMessage.author?.id,
                channelId: newMessage.channelId,
            },
        )

        const embed = new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle('✏️ Message Edited')
            .addFields(
                {
                    name: 'Author',
                    value: `${newMessage.author?.tag ?? 'Unknown'} (${newMessage.author?.id ?? '?'})`,
                    inline: true,
                },
                {
                    name: 'Channel',
                    value: `<#${newMessage.channelId}>`,
                    inline: true,
                },
                {
                    name: 'Before',
                    value:
                        oldMessage.content?.substring(0, 500) || '[No content]',
                },
                {
                    name: 'After',
                    value:
                        newMessage.content?.substring(0, 500) || '[No content]',
                },
            )
            .setTimestamp()
        await postToModLog(newMessage.guild, embed)

        debugLog({
            message: `Logged message edit in ${newMessage.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging message edit:',
            error,
        })
    }
}

async function handleGuildBanAdd(ban: {
    user: { id: string; username: string; tag: string }
    guild: Guild
}): Promise<void> {
    if (!(await isServerLogsEnabled(ban.guild.id))) return
    try {
        const guild = ban.guild
        const auditLogs = await guild
            .fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 })
            .catch(() => null)
        const banEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            guild.id,
            'mod_action',
            'Member banned',
            {
                userId: ban.user.id,
                username: ban.user.username,
                tag: ban.user.tag,
                reason: banEntry?.reason || 'No reason provided',
            },
            {
                userId: ban.user.id,
                moderatorId: banEntry?.executor?.id,
            },
        )

        // Bot-issued bans (via /ban) already post to the mod-log channel with
        // the command's reason at creation time — posting again here would
        // duplicate it. Only post for bans made outside the bot (native
        // Discord UI, other bots).
        if (
            banEntry?.executor &&
            banEntry.executor.id !== guild.client.user?.id
        ) {
            const embed = new EmbedBuilder()
                .setColor(0xc92a2a)
                .setTitle('🔨 Member Banned')
                .addFields(
                    {
                        name: 'User',
                        value: `${ban.user.tag} (${ban.user.id})`,
                        inline: true,
                    },
                    moderatorField(banEntry?.executor),
                    {
                        name: 'Reason',
                        value: banEntry?.reason || 'No reason provided',
                    },
                )
                .setTimestamp()
            await postToModLog(guild, embed)
        }

        debugLog({
            message: `Logged ban in ${guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging ban:',
            error,
        })
    }
}

async function handleGuildBanRemove(ban: {
    user: { id: string; username: string; tag: string }
    guild: Guild
}): Promise<void> {
    if (!(await isServerLogsEnabled(ban.guild.id))) return
    try {
        const guild = ban.guild
        const auditLogs = await guild
            .fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 })
            .catch(() => null)
        const unbanEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            guild.id,
            'mod_action',
            'Member unbanned',
            {
                userId: ban.user.id,
                username: ban.user.username,
                tag: ban.user.tag,
                reason: unbanEntry?.reason || 'No reason provided',
            },
            {
                userId: ban.user.id,
                moderatorId: unbanEntry?.executor?.id,
            },
        )

        // Bot-issued unbans (via /unban) already post to the mod-log channel
        // at creation time — see handleGuildBanAdd for the same guard.
        if (
            unbanEntry?.executor &&
            unbanEntry.executor.id !== guild.client.user?.id
        ) {
            const embed = new EmbedBuilder()
                .setColor(0x51cf66)
                .setTitle('✅ Member Unbanned')
                .addFields(
                    {
                        name: 'User',
                        value: `${ban.user.tag} (${ban.user.id})`,
                        inline: true,
                    },
                    moderatorField(unbanEntry?.executor),
                    {
                        name: 'Reason',
                        value: unbanEntry?.reason || 'No reason provided',
                    },
                )
                .setTimestamp()
            await postToModLog(guild, embed)
        }

        debugLog({
            message: `Logged unban in ${guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging unban:',
            error,
        })
    }
}

async function handleChannelEvent(
    channel: GuildChannel,
    action: 'created' | 'deleted',
    auditLogAction: AuditLogEvent,
): Promise<void> {
    if (!(await isServerLogsEnabled(channel.guild.id))) return
    try {
        const auditLogs = await channel.guild
            .fetchAuditLogs({ type: auditLogAction, limit: 1 })
            .catch(() => null)
        const channelEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            channel.guild.id,
            'channel_update',
            `Channel ${action}`,
            {
                channelId: channel.id,
                channelName: channel.name,
                channelType: channel.type,
            },
            {
                channelId: channel.id,
                moderatorId: channelEntry?.executor?.id,
            },
        )

        const embed = new EmbedBuilder()
            .setColor(action === 'created' ? 0x57f287 : 0xed4245)
            .setTitle(
                action === 'created'
                    ? '➕ Channel Created'
                    : '➖ Channel Deleted',
            )
            .addFields(
                { name: 'Channel', value: `#${channel.name}`, inline: true },
                moderatorField(channelEntry?.executor),
            )
            .setTimestamp()
        await postToModLog(channel.guild, embed)

        debugLog({
            message: `Logged channel ${action} in ${channel.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: `Error logging channel ${action}:`,
            error,
        })
    }
}

async function handleChannelCreate(channel: GuildChannel): Promise<void> {
    await handleChannelEvent(channel, 'created', AuditLogEvent.ChannelCreate)
}

async function handleChannelDelete(channel: GuildChannel): Promise<void> {
    await handleChannelEvent(channel, 'deleted', AuditLogEvent.ChannelDelete)
}

async function handleRoleEvent(
    role: Role,
    action: 'created' | 'deleted',
    auditLogAction: AuditLogEvent,
): Promise<void> {
    if (!(await isServerLogsEnabled(role.guild.id))) return
    try {
        const auditLogs = await role.guild
            .fetchAuditLogs({ type: auditLogAction, limit: 1 })
            .catch(() => null)
        const roleEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            role.guild.id,
            'role_update',
            `Role ${action}`,
            {
                roleId: role.id,
                roleName: role.name,
                color: role.color,
                permissions: role.permissions.bitfield.toString(),
            },
            {
                moderatorId: roleEntry?.executor?.id,
            },
        )

        const embed = new EmbedBuilder()
            .setColor(action === 'created' ? 0x57f287 : 0xed4245)
            .setTitle(
                action === 'created' ? '➕ Role Created' : '➖ Role Deleted',
            )
            .addFields(
                { name: 'Role', value: role.name, inline: true },
                moderatorField(roleEntry?.executor),
            )
            .setTimestamp()
        await postToModLog(role.guild, embed)

        debugLog({
            message: `Logged role ${action} in ${role.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: `Error logging role ${action}:`,
            error,
        })
    }
}

async function handleRoleCreate(role: Role): Promise<void> {
    await handleRoleEvent(role, 'created', AuditLogEvent.RoleCreate)
}

async function handleRoleDelete(role: Role): Promise<void> {
    await handleRoleEvent(role, 'deleted', AuditLogEvent.RoleDelete)
}

async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
    if (!(await isServerLogsEnabled(member.guild.id))) return
    try {
        await serverLogService.createLog(
            member.guild.id,
            'member_join',
            'Member joined',
            {
                username: member.user.tag,
                accountCreated: member.user.createdAt.toISOString(),
            },
            { userId: member.user.id },
        )

        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('📥 Member Joined')
            .addFields(
                {
                    name: 'User',
                    value: `${member.user.tag} (${member.user.id})`,
                    inline: true,
                },
                {
                    name: 'Account Created',
                    value: `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`,
                    inline: true,
                },
            )
            .setTimestamp()
        await postToModLog(member.guild, embed)

        debugLog({
            message: `Logged member join in ${member.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging member join:',
            error,
        })
    }
}

async function handleGuildMemberRemove(
    member: GuildMember | PartialGuildMember,
): Promise<void> {
    if (!(await isServerLogsEnabled(member.guild.id))) return
    try {
        const roleNames = member.roles.cache
            .filter((role) => role.name !== '@everyone')
            .map((role) => role.name)

        await serverLogService.createLog(
            member.guild.id,
            'member_leave',
            'Member left',
            {
                username: member.user.tag,
                roles: roleNames,
            },
            { userId: member.user.id },
        )

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('📤 Member Left')
            .addFields(
                {
                    name: 'User',
                    value: `${member.user.tag} (${member.user.id})`,
                    inline: true,
                },
                {
                    name: 'Roles',
                    value:
                        roleNames.length > 0
                            ? roleNames.join(', ').slice(0, 1024)
                            : 'None',
                },
            )
            .setTimestamp()
        await postToModLog(member.guild, embed)

        debugLog({
            message: `Logged member leave in ${member.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging member leave:',
            error,
        })
    }
}

export function handleAuditEvents(client: Client): void {
    client.on(
        Events.MessageDelete,
        async (message: Message<boolean> | PartialMessage<boolean>) => {
            try {
                await handleMessageDelete(message)
            } catch (error) {
                errorLog({
                    message: 'Error in message delete handler:',
                    error,
                })
            }
        },
    )

    client.on(
        Events.MessageUpdate,
        async (
            oldMessage: Message<boolean> | PartialMessage<boolean>,
            newMessage: Message<boolean> | PartialMessage<boolean>,
        ) => {
            try {
                await handleMessageUpdate(oldMessage, newMessage)
            } catch (error) {
                errorLog({
                    message: 'Error in message update handler:',
                    error,
                })
            }
        },
    )

    client.on(Events.GuildBanAdd, async (ban: GuildBan) => {
        try {
            await handleGuildBanAdd(ban)
        } catch (error) {
            errorLog({
                message: 'Error in ban add handler:',
                error,
            })
        }
    })

    client.on(Events.GuildBanRemove, async (ban: GuildBan) => {
        try {
            await handleGuildBanRemove(ban)
        } catch (error) {
            errorLog({
                message: 'Error in ban remove handler:',
                error,
            })
        }
    })

    client.on(
        Events.ChannelCreate,
        async (channel: DMChannel | NonThreadGuildBasedChannel) => {
            try {
                if ('guild' in channel) {
                    await handleChannelCreate(channel as GuildChannel)
                }
            } catch (error) {
                errorLog({
                    message: 'Error in channel create handler:',
                    error,
                })
            }
        },
    )

    client.on(
        Events.ChannelDelete,
        async (channel: DMChannel | NonThreadGuildBasedChannel) => {
            try {
                if ('guild' in channel) {
                    await handleChannelDelete(channel as GuildChannel)
                }
            } catch (error) {
                errorLog({
                    message: 'Error in channel delete handler:',
                    error,
                })
            }
        },
    )

    client.on(Events.GuildRoleCreate, async (role: Role) => {
        try {
            await handleRoleCreate(role)
        } catch (error) {
            errorLog({
                message: 'Error in role create handler:',
                error,
            })
        }
    })

    client.on(Events.GuildRoleDelete, async (role: Role) => {
        try {
            await handleRoleDelete(role)
        } catch (error) {
            errorLog({
                message: 'Error in role delete handler:',
                error,
            })
        }
    })

    client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
        try {
            await handleGuildMemberAdd(member)
        } catch (error) {
            errorLog({
                message: 'Error in member add handler:',
                error,
            })
        }
    })

    client.on(
        Events.GuildMemberRemove,
        async (member: GuildMember | PartialGuildMember) => {
            try {
                await handleGuildMemberRemove(member)
            } catch (error) {
                errorLog({
                    message: 'Error in member remove handler:',
                    error,
                })
            }
        },
    )
}
