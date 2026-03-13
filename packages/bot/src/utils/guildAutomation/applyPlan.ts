import {
    ChannelType,
    type Guild,
    type GuildBasedChannel,
    type GuildChannelCreateOptions,
} from 'discord.js'
import {
    autoMessageService,
    autoModService,
    manifestOnboardingToDiscordEdit,
    guildRoleAccessService,
    roleManagementService,
    updateModerationSettings,
    type GuildAutomationManifestDocument,
    type GuildAutomationPlan,
} from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'

type ApplyResult = {
    appliedModules: string[]
    skippedModules: string[]
}

type ReconciliableChannelType = Exclude<GuildChannelCreateOptions['type'], undefined>

type ManagedAutoMessage = {
    enabled?: boolean
    channelId?: string
    message?: string
}

function toPermissions(value: string | undefined) {
    if (!value) {
        return undefined
    }

    return BigInt(value)
}

function mapChannelType(type: string): ReconciliableChannelType {
    switch (type) {
        case 'GuildCategory':
            return ChannelType.GuildCategory
        case 'GuildVoice':
            return ChannelType.GuildVoice
        case 'GuildAnnouncement':
            return ChannelType.GuildAnnouncement
        case 'GuildForum':
            return ChannelType.GuildForum
        case 'GuildStageVoice':
            return ChannelType.GuildStageVoice
        default:
            return ChannelType.GuildText
    }
}

function shouldApplyModule(
    plan: GuildAutomationPlan,
    module: GuildAutomationPlan['operations'][number]['module'],
    allowProtected: boolean,
): boolean {
    return plan.operations.some(
        (operation) =>
            operation.module === module &&
            (allowProtected || operation.protected === false),
    )
}

async function upsertAutoMessage(
    guildId: string,
    type: 'welcome' | 'leave',
    payload: ManagedAutoMessage | undefined,
): Promise<void> {
    if (!payload?.message) {
        return
    }

    const existing =
        type === 'welcome'
            ? await autoMessageService.getWelcomeMessage(guildId)
            : await autoMessageService.getLeaveMessage(guildId)

    if (!existing) {
        await autoMessageService.createMessage(
            guildId,
            type,
            {
                message: payload.message,
            },
            {
                channelId: payload.channelId,
            },
        )
        return
    }

    await autoMessageService.updateMessage(existing.id, {
        message: payload.message,
        channelId: payload.channelId,
        enabled: payload.enabled,
    })
}

function findChannel(guild: Guild, id: string): GuildBasedChannel | null {
    return guild.channels.cache.get(id) ?? null
}

function shouldIgnoreProtectedDeleteError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false
    }

    const maybeError = error as {
        status?: unknown
        code?: unknown
    }

    return (
        maybeError.status === 403 ||
        maybeError.status === 404 ||
        maybeError.code === 50013 ||
        maybeError.code === 10003 ||
        maybeError.code === 10008
    )
}

async function applyRolesAndChannels(
    guild: Guild,
    desired: GuildAutomationManifestDocument,
    allowProtected: boolean,
): Promise<void> {
    const desiredRoles = desired.roles?.roles ?? []
    const desiredChannels = desired.roles?.channels ?? []

    for (const role of desiredRoles) {
        const existing = guild.roles.cache.get(role.id)
        if (!existing) {
            await guild.roles.create({
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                permissions: toPermissions(role.permissions),
                reason: 'Lucky guild automation reconcile',
            })
            continue
        }

        await existing.edit({
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            mentionable: role.mentionable,
            permissions: toPermissions(role.permissions),
            reason: 'Lucky guild automation reconcile',
        })
    }

    for (const channel of desiredChannels) {
        const existing = findChannel(guild, channel.id)

        if (!existing) {
            await guild.channels.create({
                name: channel.name,
                type: mapChannelType(channel.type),
                parent: channel.parentId ?? undefined,
                topic: channel.topic ?? undefined,
                reason: 'Lucky guild automation reconcile',
            })
            continue
        }

        await existing.edit({
            name: channel.name,
            parent: channel.parentId ?? undefined,
            topic: channel.topic ?? undefined,
            reason: 'Lucky guild automation reconcile',
        })
    }

    if (!allowProtected) {
        return
    }

    const desiredRoleIds = new Set(desiredRoles.map((role) => role.id))
    const desiredChannelIds = new Set(desiredChannels.map((channel) => channel.id))

    for (const role of guild.roles.cache.values()) {
        if (role.id === guild.id || desiredRoleIds.has(role.id)) {
            continue
        }

        if (role.editable) {
            await role.delete('Lucky guild automation protected-delete apply')
        }
    }

    for (const channel of guild.channels.cache.values()) {
        if (desiredChannelIds.has(channel.id)) {
            continue
        }

        try {
            await channel.delete('Lucky guild automation protected-delete apply')
        } catch (error) {
            if (shouldIgnoreProtectedDeleteError(error)) {
                errorLog({
                    message:
                        'Failed to delete channel during guild automation apply',
                    error,
                    data: {
                        guildId: guild.id,
                        channelId: channel.id,
                    },
                })
                continue
            }

            throw error
        }
    }
}

async function applyReactionRoleRules(
    guildId: string,
    desired: GuildAutomationManifestDocument,
): Promise<void> {
    const nextPairs = new Set(
        (desired.reactionroles?.exclusiveRoles ?? []).map(
            (item) => `${item.roleId}:${item.excludedRoleId}`,
        ),
    )

    const existing = await roleManagementService.listExclusiveRoles(guildId)

    for (const item of existing) {
        const key = `${item.roleId}:${item.excludedRoleId}`
        if (!nextPairs.has(key)) {
            await roleManagementService.removeExclusiveRole(
                guildId,
                item.roleId,
                item.excludedRoleId,
            )
        }
    }

    for (const item of desired.reactionroles?.exclusiveRoles ?? []) {
        await roleManagementService.setExclusiveRole(
            guildId,
            item.roleId,
            item.excludedRoleId,
        )
    }
}

export async function applyAutomationModules(params: {
    guild: Guild
    desired: GuildAutomationManifestDocument
    plan: GuildAutomationPlan
    allowProtected: boolean
}): Promise<ApplyResult> {
    const { guild, desired, plan, allowProtected } = params
    const appliedModules: string[] = []
    const skippedModules: string[] = []

    if (shouldApplyModule(plan, 'onboarding', allowProtected)) {
        const payload = manifestOnboardingToDiscordEdit(desired.onboarding)
        if (payload) {
            await guild.editOnboarding(payload)
            appliedModules.push('onboarding')
        }
    }

    if (shouldApplyModule(plan, 'roles', allowProtected) && desired.roles) {
        await applyRolesAndChannels(guild, desired, allowProtected)
        appliedModules.push('roles')
    }

    if (shouldApplyModule(plan, 'moderation', allowProtected)) {
        if (desired.moderation?.automod) {
            await autoModService.updateSettings(
                guild.id,
                desired.moderation.automod as never,
            )
        }

        if (desired.moderation?.moderationSettings) {
            await updateModerationSettings(
                guild.id,
                desired.moderation.moderationSettings as never,
            )
        }

        appliedModules.push('moderation')
    }

    if (shouldApplyModule(plan, 'automessages', allowProtected)) {
        await upsertAutoMessage(guild.id, 'welcome', desired.automessages?.welcome)
        await upsertAutoMessage(guild.id, 'leave', desired.automessages?.leave)
        appliedModules.push('automessages')
    }

    if (shouldApplyModule(plan, 'reactionroles', allowProtected)) {
        await applyReactionRoleRules(guild.id, desired)
        if ((desired.reactionroles?.messages?.length ?? 0) > 0) {
            skippedModules.push(
                'reactionroles.messages requires manual message-template publish',
            )
        }
        appliedModules.push('reactionroles')
    }

    if (shouldApplyModule(plan, 'commandaccess', allowProtected)) {
        await guildRoleAccessService.replaceRoleGrants(
            guild.id,
            desired.commandaccess?.grants ?? [],
        )
        appliedModules.push('commandaccess')
    }

    if (shouldApplyModule(plan, 'parity', allowProtected)) {
        skippedModules.push('parity requires checklist/cutover workflow')
    }

    return {
        appliedModules,
        skippedModules,
    }
}
