import {
    Events,
    type Client,
    type Message,
    type PartialMessage,
    type GuildMember,
    type Guild,
    type GuildChannel,
    type Role,
    AuditLogEvent,
} from 'discord.js'
import { serverLogService } from '@lukbot/shared/services'
import { featureToggleService } from '@lukbot/shared/services'
import { errorLog, debugLog } from '@lukbot/shared/utils'

async function isServerLogsEnabled(guildId: string): Promise<boolean> {
    return featureToggleService.isEnabled('SERVER_LOGS', { guildId })
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

async function handleChannelCreate(channel: GuildChannel): Promise<void> {
    if (!(await isServerLogsEnabled(channel.guild.id))) return
    try {
        const auditLogs = await channel.guild
            .fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 })
            .catch(() => null)
        const channelEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            channel.guild.id,
            'channel_update',
            'Channel created',
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

        debugLog({
            message: `Logged channel create in ${channel.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging channel create:',
            error,
        })
    }
}

async function handleChannelDelete(channel: GuildChannel): Promise<void> {
    if (!(await isServerLogsEnabled(channel.guild.id))) return
    try {
        const auditLogs = await channel.guild
            .fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 })
            .catch(() => null)
        const channelEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            channel.guild.id,
            'channel_update',
            'Channel deleted',
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

        debugLog({
            message: `Logged channel delete in ${channel.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging channel delete:',
            error,
        })
    }
}

async function handleRoleCreate(role: Role): Promise<void> {
    try {
        const auditLogs = await role.guild
            .fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 })
            .catch(() => null)
        const roleEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            role.guild.id,
            'role_update',
            'Role created',
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

        debugLog({
            message: `Logged role create in ${role.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging role create:',
            error,
        })
    }
}

async function handleRoleDelete(role: Role): Promise<void> {
    try {
        const auditLogs = await role.guild
            .fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 })
            .catch(() => null)
        const roleEntry = auditLogs?.entries.first()

        await serverLogService.createLog(
            role.guild.id,
            'role_update',
            'Role deleted',
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

        debugLog({
            message: `Logged role delete in ${role.guild.name}`,
        })
    } catch (error) {
        errorLog({
            message: 'Error logging role delete:',
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

    client.on(Events.GuildBanAdd, async (ban: any) => {
        try {
            await handleGuildBanAdd(ban)
        } catch (error) {
            errorLog({
                message: 'Error in ban add handler:',
                error,
            })
        }
    })

    client.on(Events.GuildBanRemove, async (ban: any) => {
        try {
            await handleGuildBanRemove(ban)
        } catch (error) {
            errorLog({
                message: 'Error in ban remove handler:',
                error,
            })
        }
    })

    client.on(Events.ChannelCreate, async (channel: any) => {
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
    })

    client.on(Events.ChannelDelete, async (channel: any) => {
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
    })

    // Note: RoleCreate and RoleDelete events are not in the Events enum in discord.js
    // These would need to be handled through audit log polling or webhooks if needed
}
