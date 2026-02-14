import type { ServerLogService } from './ServerLogService.js'

export async function logMessageDelete(
    svc: ServerLogService,
    guildId: string,
    messageId: string,
    channelId: string,
    userId: string,
    content: string,
    moderatorId?: string,
) {
    return svc.createLog(
        guildId,
        'message_delete',
        'Message deleted',
        { messageId, content },
        { userId, channelId, moderatorId },
    )
}

export async function logMessageEdit(
    svc: ServerLogService,
    guildId: string,
    messageId: string,
    channelId: string,
    userId: string,
    oldContent: string,
    newContent: string,
) {
    return svc.createLog(
        guildId,
        'message_edit',
        'Message edited',
        { messageId, oldContent, newContent },
        { userId, channelId },
    )
}

export async function logMemberJoin(
    svc: ServerLogService,
    guildId: string,
    userId: string,
    username: string,
    accountCreated: Date,
) {
    return svc.createLog(
        guildId,
        'member_join',
        'Member joined',
        { username, accountCreated: accountCreated.toISOString() },
        { userId },
    )
}

export async function logMemberLeave(
    svc: ServerLogService,
    guildId: string,
    userId: string,
    username: string,
    roles: string[],
) {
    return svc.createLog(
        guildId,
        'member_leave',
        'Member left',
        { username, roles },
        { userId },
    )
}

export async function logRoleUpdate(
    svc: ServerLogService,
    guildId: string,
    userId: string,
    addedRoles: string[],
    removedRoles: string[],
    moderatorId?: string,
) {
    return svc.createLog(
        guildId,
        'role_update',
        'Roles updated',
        { addedRoles, removedRoles },
        { userId, moderatorId },
    )
}

export async function logVoiceState(
    svc: ServerLogService,
    guildId: string,
    userId: string,
    action: 'join' | 'leave' | 'move',
    channelId: string,
    oldChannelId?: string,
) {
    return svc.createLog(
        guildId,
        'voice_state',
        `Voice ${action}`,
        { oldChannelId },
        { userId, channelId },
    )
}

export async function logModerationAction(
    svc: ServerLogService,
    guildId: string,
    action: string,
    details: {
        caseNumber: number
        type: string
        userId: string
        username: string
        reason?: string
        duration?: number
        silent?: boolean
    },
    moderatorId: string,
) {
    return svc.createLog(guildId, 'mod_action', action, details, {
        userId: details.userId,
        moderatorId,
    })
}

export async function logCaseUpdate(
    svc: ServerLogService,
    guildId: string,
    details: {
        caseNumber: number
        changeType:
            | 'reason_update'
            | 'deactivated'
            | 'appeal_submitted'
            | 'appeal_reviewed'
        oldValue?: string
        newValue?: string
    },
    moderatorId: string,
) {
    return svc.createLog(
        guildId,
        'mod_case_update',
        `Case #${details.caseNumber} ${details.changeType}`,
        details,
        { moderatorId },
    )
}

export async function logAutoModTrigger(
    svc: ServerLogService,
    guildId: string,
    details: {
        rule: string
        action: string
        messageContent?: string
        channelId: string
    },
    userId: string,
) {
    return svc.createLog(
        guildId,
        'automod_trigger',
        `AutoMod: ${details.rule}`,
        details,
        { userId, channelId: details.channelId },
    )
}

export async function logAutoModSettingsChange(
    svc: ServerLogService,
    guildId: string,
    details: {
        module: string
        enabled: boolean
        changes: Record<string, unknown>
    },
    moderatorId: string,
) {
    return svc.createLog(
        guildId,
        'automod_settings',
        `AutoMod ${details.module} ${details.enabled ? 'enabled' : 'disabled'}`,
        details,
        { moderatorId },
    )
}

export async function logCustomCommandChange(
    svc: ServerLogService,
    guildId: string,
    action: 'created' | 'updated' | 'deleted',
    details: { commandName: string; changes?: Record<string, unknown> },
    moderatorId: string,
) {
    return svc.createLog(
        guildId,
        'custom_command',
        `Custom command ${action}: ${details.commandName}`,
        details,
        { moderatorId },
    )
}

export async function logEmbedTemplateChange(
    svc: ServerLogService,
    guildId: string,
    action: 'created' | 'updated' | 'deleted' | 'sent',
    details: { templateName: string; channelId?: string },
    moderatorId: string,
) {
    return svc.createLog(
        guildId,
        'embed_template',
        `Embed template ${action}: ${details.templateName}`,
        details,
        {
            moderatorId,
            ...(details.channelId && { channelId: details.channelId }),
        },
    )
}

export async function logAutoMessageChange(
    svc: ServerLogService,
    guildId: string,
    action: 'created' | 'updated' | 'enabled' | 'disabled',
    details: {
        type: string
        channelId?: string
        changes?: Record<string, unknown>
    },
    moderatorId: string,
) {
    return svc.createLog(
        guildId,
        'auto_message',
        `Auto-message ${details.type} ${action}`,
        details,
        { moderatorId },
    )
}

export async function logSettingsChange(
    svc: ServerLogService,
    guildId: string,
    details: { setting: string; oldValue?: unknown; newValue?: unknown },
    moderatorId: string,
) {
    return svc.createLog(
        guildId,
        'settings_change',
        `Setting changed: ${details.setting}`,
        details,
        { moderatorId },
    )
}
