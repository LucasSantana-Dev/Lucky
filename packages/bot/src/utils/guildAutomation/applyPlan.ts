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

type AutoModUpdatePayload = Parameters<typeof autoModService.updateSettings>[1]
type ModerationUpdatePayload = Parameters<typeof updateModerationSettings>[1]

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

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toAutoModUpdatePayload(value: unknown): AutoModUpdatePayload | null {
    return isObject(value) ? (value as AutoModUpdatePayload) : null
}

function toModerationUpdatePayload(
    value: unknown,
): ModerationUpdatePayload | null {
    return isObject(value) ? (value as ModerationUpdatePayload) : null
}

function isExpectedDeleteError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false
    }

    const status = Reflect.get(error, 'status')
    const code = Reflect.get(error, 'code')
    return status === 404 || status === 403 || code === 10003 || code === 50013
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

async function applyRolesAndChannels(
    guild: Guild,
    desired: GuildAutomationManifestDocument,
    allowProtected: boolean,
): Promise<void> {
    const desiredRoles = desired.roles?.roles ?? []
    const desiredChannels = desired.roles?.channels ?? []

    await syncRoles(guild, desiredRoles)
    await syncChannels(guild, desiredChannels)

    if (!allowProtected) {
        return
    }

    const desiredRoleIds = new Set(desiredRoles.map((role) => role.id))
    const desiredChannelIds = new Set(desiredChannels.map((channel) => channel.id))
    await deleteUnmanagedEntities(guild, desiredRoleIds, desiredChannelIds)
}

async function syncRoles(
    guild: Guild,
    desiredRoles: NonNullable<GuildAutomationManifestDocument['roles']>['roles'],
): Promise<void> {
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
}

async function syncChannels(
    guild: Guild,
    desiredChannels: NonNullable<GuildAutomationManifestDocument['roles']>['channels'],
): Promise<void> {
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
}

async function deleteUnmanagedEntities(
    guild: Guild,
    desiredRoleIds: Set<string>,
    desiredChannelIds: Set<string>,
): Promise<void> {
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
            if (!isExpectedDeleteError(error)) {
                throw error
            }

            errorLog({
                message: 'Failed to delete channel during guild automation apply',
                error,
                data: {
                    guildId: guild.id,
                    channelId: channel.id,
                    channelName: channel.name,
                },
            })
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
    const { plan, allowProtected } = params
    const appliedModules: string[] = []
    const skippedModules: string[] = []

    if (shouldApplyModule(plan, 'onboarding', allowProtected)) {
        await handleOnboardingModule(params, appliedModules)
    }

    if (shouldApplyModule(plan, 'roles', allowProtected)) {
        await handleRolesModule(params, appliedModules)
    }

    if (shouldApplyModule(plan, 'moderation', allowProtected)) {
        await handleModerationModule(params, appliedModules)
    }

    if (shouldApplyModule(plan, 'automessages', allowProtected)) {
        await handleAutomessagesModule(params, appliedModules)
    }

    if (shouldApplyModule(plan, 'reactionroles', allowProtected)) {
        await handleReactionRolesModule(params, appliedModules, skippedModules)
    }

    if (shouldApplyModule(plan, 'commandaccess', allowProtected)) {
        await handleCommandAccessModule(params, appliedModules)
    }

    if (shouldApplyModule(plan, 'parity', allowProtected)) {
        handleParityModule(skippedModules)
    }

    return {
        appliedModules,
        skippedModules,
    }
}

type ApplyContext = {
    guild: Guild
    desired: GuildAutomationManifestDocument
    allowProtected: boolean
}

async function handleOnboardingModule(
    params: ApplyContext,
    appliedModules: string[],
): Promise<void> {
    const payload = manifestOnboardingToDiscordEdit(params.desired.onboarding)
    if (!payload) {
        return
    }

    await params.guild.editOnboarding(payload)
    appliedModules.push('onboarding')
}

async function handleRolesModule(
    params: ApplyContext,
    appliedModules: string[],
): Promise<void> {
    if (!params.desired.roles) {
        return
    }

    await applyRolesAndChannels(params.guild, params.desired, params.allowProtected)
    appliedModules.push('roles')
}

async function handleModerationModule(
    params: ApplyContext,
    appliedModules: string[],
): Promise<void> {
    const automodPayload = toAutoModUpdatePayload(
        params.desired.moderation?.automod,
    )
    if (automodPayload) {
        await autoModService.updateSettings(params.guild.id, automodPayload)
    }

    const moderationPayload = toModerationUpdatePayload(
        params.desired.moderation?.moderationSettings,
    )
    if (moderationPayload) {
        await updateModerationSettings(params.guild.id, moderationPayload)
    }

    appliedModules.push('moderation')
}

async function handleAutomessagesModule(
    params: ApplyContext,
    appliedModules: string[],
): Promise<void> {
    await upsertAutoMessage(
        params.guild.id,
        'welcome',
        params.desired.automessages?.welcome,
    )
    await upsertAutoMessage(
        params.guild.id,
        'leave',
        params.desired.automessages?.leave,
    )
    appliedModules.push('automessages')
}

async function handleReactionRolesModule(
    params: ApplyContext,
    appliedModules: string[],
    skippedModules: string[],
): Promise<void> {
    await applyReactionRoleRules(params.guild.id, params.desired)
    if ((params.desired.reactionroles?.messages?.length ?? 0) > 0) {
        skippedModules.push(
            'reactionroles.messages requires manual message-template publish',
        )
    }
    appliedModules.push('reactionroles')
}

async function handleCommandAccessModule(
    params: ApplyContext,
    appliedModules: string[],
): Promise<void> {
    await guildRoleAccessService.replaceRoleGrants(
        params.guild.id,
        params.desired.commandaccess?.grants ?? [],
    )
    appliedModules.push('commandaccess')
}

function handleParityModule(skippedModules: string[]): void {
    skippedModules.push('parity requires checklist/cutover workflow')
}
