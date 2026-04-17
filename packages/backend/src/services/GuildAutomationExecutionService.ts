import {
    autoMessageService,
    autoModService,
    getModerationSettings,
    guildAutomationService,
    guildRoleAccessService,
    reactionRolesService,
    roleManagementService,
    updateModerationSettings,
    type GuildAutomationManifestDocument,
    type GuildAutomationPlan,
} from '@lucky/shared/services'
import { debugLog } from '@lucky/shared/utils'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'
const DEFAULT_SOURCE = 'discord-capture'

type AutoModUpdatePayload = Parameters<typeof autoModService.updateSettings>[1]
type ModerationUpdatePayload = Parameters<typeof updateModerationSettings>[1]

type ManagedAutoMessage = {
    enabled?: boolean
    channelId?: string
    message?: string
}

type DiscordGuildResponse = {
    id: string
    name: string
}

type DiscordRoleResponse = {
    id: string
    name: string
    color?: number
    hoist?: boolean
    mentionable?: boolean
    permissions?: string
    managed?: boolean
}

type DiscordChannelResponse = {
    id: string
    name: string
    type: number
    parent_id?: string | null
    topic?: string | null
}

type DiscordEmojiResponse = {
    id?: string | null
    name?: string | null
}

type DiscordOnboardingPromptOptionResponse = {
    id?: string
    title?: string
    description?: string | null
    channel_ids?: string[]
    role_ids?: string[]
    emoji?: DiscordEmojiResponse | null
}

type DiscordOnboardingPromptResponse = {
    id?: string
    title?: string
    single_select?: boolean
    required?: boolean
    in_onboarding?: boolean
    type?: number
    options?: DiscordOnboardingPromptOptionResponse[]
}

type DiscordOnboardingResponse = {
    enabled?: boolean
    mode?: number
    default_channel_ids?: string[]
    prompts?: DiscordOnboardingPromptResponse[]
}

type RoleRemap = Map<string, string>
type ChannelRemap = Map<string, string>
type ManifestRoles = NonNullable<GuildAutomationManifestDocument['roles']>
type ManifestRole = ManifestRoles['roles'][number]
type ManifestChannel = ManifestRoles['channels'][number]

const SUPPORTED_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15])

export class GuildAutomationExecutionError extends Error {
    constructor(
        message: string,
        public readonly statusCode = 500,
    ) {
        super(message)
        this.name = 'GuildAutomationExecutionError'
    }
}

function normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    return value as Record<string, unknown>
}

function toAutoModPayload(
    value: GuildAutomationManifestDocument['moderation'] extends {
        automod?: infer T
    }
        ? T
        : unknown,
): AutoModUpdatePayload | null {
    return asObject(value) ? (value as AutoModUpdatePayload) : null
}

function toModerationPayload(
    value: GuildAutomationManifestDocument['moderation'] extends {
        moderationSettings?: infer T
    }
        ? T
        : unknown,
): ModerationUpdatePayload | null {
    return asObject(value) ? (value as ModerationUpdatePayload) : null
}

function isExpectedDeleteError(error: unknown): boolean {
    if (!(error instanceof GuildAutomationExecutionError)) {
        return false
    }

    return error.statusCode === 403 || error.statusCode === 404
}

function isOnboardingUnavailable(error: unknown): boolean {
    if (!(error instanceof GuildAutomationExecutionError)) {
        return false
    }

    return error.statusCode === 403 || error.statusCode === 404
}

function mapChannelType(type: number): string {
    switch (type) {
        case 4:
            return 'GuildCategory'
        case 2:
            return 'GuildVoice'
        case 5:
            return 'GuildAnnouncement'
        case 15:
            return 'GuildForum'
        case 13:
            return 'GuildStageVoice'
        default:
            return 'GuildText'
    }
}

function toDiscordChannelType(type: string): number {
    switch (type) {
        case 'GuildCategory':
            return 4
        case 'GuildVoice':
            return 2
        case 'GuildAnnouncement':
            return 5
        case 'GuildForum':
            return 15
        case 'GuildStageVoice':
            return 13
        default:
            return 0
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

function defaultParityChecklist() {
    return [
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
    ]
}


type RemapFn = (id: string | undefined | null) => string | undefined | null

function remapRolesSection(
    next: GuildAutomationManifestDocument,
    remapRole: RemapFn,
    remapChannel: RemapFn,
): void {
    if (!next.roles) return
    next.roles.roles = next.roles.roles.map((role) => ({
        ...role,
        id: remapRole(role.id) ?? role.id,
    }))
    next.roles.channels = next.roles.channels.map((channel) => ({
        ...channel,
        id: remapChannel(channel.id) ?? channel.id,
        parentId: remapChannel(channel.parentId) ?? null,
    }))
}

function remapOnboardingSection(
    next: GuildAutomationManifestDocument,
    remapRole: RemapFn,
    remapChannel: RemapFn,
): void {
    if (!next.onboarding) return
    next.onboarding.defaultChannelIds = next.onboarding.defaultChannelIds
        .map((id) => remapChannel(id))
        .filter((id): id is string => Boolean(id))
    next.onboarding.prompts = next.onboarding.prompts.map((prompt) => ({
        ...prompt,
        options: prompt.options.map((option) => ({
            ...option,
            channelIds: option.channelIds
                ?.map((id) => remapChannel(id))
                .filter((id): id is string => Boolean(id)),
            roleIds: option.roleIds
                ?.map((id) => remapRole(id))
                .filter((id): id is string => Boolean(id)),
        })),
    }))
}

function remapModerationSection(
    next: GuildAutomationManifestDocument,
    remapRole: RemapFn,
    remapChannel: RemapFn,
): void {
    if (next.moderation?.automod) {
        next.moderation.automod.exemptRoles = next.moderation.automod.exemptRoles
            ?.map((id) => remapRole(id))
            .filter((id): id is string => Boolean(id))
        next.moderation.automod.exemptChannels =
            next.moderation.automod.exemptChannels
                ?.map((id) => remapChannel(id))
                .filter((id): id is string => Boolean(id))
    }
    if (next.moderation?.moderationSettings) {
        const ms = next.moderation.moderationSettings
        ms.muteRoleId = remapRole(ms.muteRoleId) ?? null
        ms.modRoleIds = ms.modRoleIds
            ?.map((id) => remapRole(id))
            .filter((id): id is string => Boolean(id))
        ms.adminRoleIds = ms.adminRoleIds
            ?.map((id) => remapRole(id))
            .filter((id): id is string => Boolean(id))
    }
}

function remapAutoMessagesSection(
    next: GuildAutomationManifestDocument,
    remapChannel: RemapFn,
): void {
    if (next.automessages?.welcome) {
        next.automessages.welcome.channelId =
            remapChannel(next.automessages.welcome.channelId) ?? undefined
    }
    if (next.automessages?.leave) {
        next.automessages.leave.channelId =
            remapChannel(next.automessages.leave.channelId) ?? undefined
    }
}

function remapReactionRolesSection(
    next: GuildAutomationManifestDocument,
    remapRole: RemapFn,
    remapChannel: RemapFn,
): void {
    if (!next.reactionroles) return
    next.reactionroles.messages = next.reactionroles.messages?.map(
        (message) => ({
            ...message,
            channelId: remapChannel(message.channelId) ?? undefined,
            mappings: message.mappings?.map((mapping) => ({
                ...mapping,
                roleId: remapRole(mapping.roleId) ?? mapping.roleId,
            })),
        }),
    )
    next.reactionroles.exclusiveRoles =
        next.reactionroles.exclusiveRoles?.map((item) => ({
            roleId: remapRole(item.roleId) ?? item.roleId,
            excludedRoleId: remapRole(item.excludedRoleId) ?? item.excludedRoleId,
        }))
}

function remapCommandAccessSection(
    next: GuildAutomationManifestDocument,
    remapRole: RemapFn,
): void {
    if (!next.commandaccess) return
    next.commandaccess.grants = next.commandaccess.grants.map((grant) => ({
        ...grant,
        roleId: remapRole(grant.roleId) ?? grant.roleId,
    }))
}

class GuildAutomationExecutionService {
    private getBotToken(): string {
        const token = process.env.DISCORD_TOKEN?.trim()

        if (!token) {
            throw new GuildAutomationExecutionError(
                'DISCORD_TOKEN is required for automation execution',
                503,
            )
        }

        return token
    }

    private async discordRequest<T>(params: {
        token: string
        endpoint: string
        method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
        body?: Record<string, unknown>
    }): Promise<T> {
        const method = params.method ?? 'GET'
        const url = `${DISCORD_API_BASE_URL}${params.endpoint}`

        let response: Response
        try {
            response = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bot ${params.token}`,
                    'Content-Type': 'application/json',
                },
                body: params.body ? JSON.stringify(params.body) : undefined,
            })
        } catch (error) {
            debugLog({
                message: 'Discord API fetch failed',
                data: { method, endpoint: params.endpoint },
                error,
            })
            throw new GuildAutomationExecutionError(
                `Discord request failed for ${method} ${params.endpoint}`,
                502,
            )
        }

        if (!response.ok) {
            const responseBody = await response.text()
            throw new GuildAutomationExecutionError(
                `Discord request failed for ${method} ${params.endpoint}: ${response.status} ${responseBody}`,
                response.status,
            )
        }

        if (response.status === 204) {
            return undefined as T
        }

        return (await response.json()) as T
    }

    private toOnboardingManifest(
        onboarding: DiscordOnboardingResponse | null,
    ): GuildAutomationManifestDocument['onboarding'] {
        if (!onboarding) {
            return undefined
        }

        return {
            enabled: onboarding.enabled ?? false,
            mode: onboarding.mode ?? 0,
            defaultChannelIds: onboarding.default_channel_ids ?? [],
            prompts: (onboarding.prompts ?? []).map((prompt) => ({
                id: prompt.id,
                title: prompt.title ?? '',
                singleSelect: prompt.single_select,
                required: prompt.required,
                inOnboarding: prompt.in_onboarding,
                type: prompt.type,
                options: (prompt.options ?? []).map((option) => ({
                    id: option.id,
                    title: option.title ?? '',
                    description: option.description ?? null,
                    channelIds: option.channel_ids ?? [],
                    roleIds: option.role_ids ?? [],
                    emoji: option.emoji?.id ?? option.emoji?.name ?? null,
                })),
            })),
        }
    }

    private async fetchOnboarding(
        guildId: string,
        token: string,
    ): Promise<DiscordOnboardingResponse | null> {
        try {
            return await this.discordRequest<DiscordOnboardingResponse>({
                token,
                endpoint: `/guilds/${guildId}/onboarding`,
            })
        } catch (error) {
            if (isOnboardingUnavailable(error)) {
                debugLog({
                    message:
                        'Onboarding unavailable while capturing guild automation state',
                    data: { guildId },
                    error,
                })
                return null
            }

            throw error
        }
    }

    private normalizeRoleKey(role: { name: string }): string {
        return normalizeName(role.name)
    }

    private normalizeChannelKey(channel: {
        name: string
        type: string
        parentId?: string | null
    }): string {
        const parentKey = channel.parentId ?? 'root'
        return [normalizeName(channel.name), channel.type, parentKey].join('|')
    }

    private resolveRoleTargetId(params: {
        desiredRoleId: string
        desiredRoleName: string
        actualRoles: ManifestRole[]
        usedActualRoleIds: Set<string>
    }): string | null {
        const desiredById = params.actualRoles.find(
            (role) => role.id === params.desiredRoleId,
        )
        if (desiredById) {
            return desiredById.id
        }

        const desiredKey = this.normalizeRoleKey({
            name: params.desiredRoleName,
        })
        const fallback = [...params.actualRoles]
            .filter((role) => !params.usedActualRoleIds.has(role.id))
            .sort((a, b) => a.id.localeCompare(b.id))
            .find(
                (role) =>
                    this.normalizeRoleKey({ name: role.name }) === desiredKey,
            )

        return fallback?.id ?? null
    }

    private resolveChannelTargetId(params: {
        desiredChannelId: string
        desiredChannelName: string
        desiredChannelType: string
        desiredParentId?: string | null
        actualChannels: ManifestChannel[]
        usedActualChannelIds: Set<string>
    }): string | null {
        const byId = params.actualChannels.find(
            (channel) => channel.id === params.desiredChannelId,
        )

        if (byId) {
            return byId.id
        }

        const desiredKey = this.normalizeChannelKey({
            name: params.desiredChannelName,
            type: params.desiredChannelType,
            parentId: params.desiredParentId,
        })

        const fallback = [...params.actualChannels]
            .filter((channel) => !params.usedActualChannelIds.has(channel.id))
            .sort((a, b) => a.id.localeCompare(b.id))
            .find(
                (channel) =>
                    this.normalizeChannelKey({
                        name: channel.name,
                        type: channel.type,
                        parentId: channel.parentId,
                    }) === desiredKey,
            )

        return fallback?.id ?? null
    }

    private remapManifestEntityIds(params: {
        manifest: GuildAutomationManifestDocument
        roleRemap: RoleRemap
        channelRemap: ChannelRemap
    }): GuildAutomationManifestDocument {
        const next = structuredClone(params.manifest)
        const remapRole: RemapFn = (id) =>
            id ? (params.roleRemap.get(id) ?? id) : id
        const remapChannel: RemapFn = (id) =>
            id ? (params.channelRemap.get(id) ?? id) : id

        remapRolesSection(next, remapRole, remapChannel)
        remapOnboardingSection(next, remapRole, remapChannel)
        remapModerationSection(next, remapRole, remapChannel)
        remapAutoMessagesSection(next, remapChannel)
        remapReactionRolesSection(next, remapRole, remapChannel)
        remapCommandAccessSection(next, remapRole)

        return next
    }

    private async upsertAutoMessage(
        guildId: string,
        type: 'welcome' | 'leave',
        payload: ManagedAutoMessage | undefined,
    ): Promise<void> {
        if (!payload?.message) {
            return
        }

        const existing = (type === "welcome"
            ? await autoMessageService.getWelcomeMessage(guildId)
                : await autoMessageService.getLeaveMessage(guildId)) as unknown

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

    private async applyOneRole(params: {
        token: string
        guildId: string
        role: ManifestRole
        actualRoles: ManifestRole[]
        usedActualRoleIds: Set<string>
        roleRemap: RoleRemap
    }): Promise<void> {
        const { token, guildId, role, actualRoles, usedActualRoleIds, roleRemap } = params
        const targetRoleId = this.resolveRoleTargetId({
            desiredRoleId: role.id,
            desiredRoleName: role.name,
            actualRoles,
            usedActualRoleIds,
        })
        const payload = {
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            mentionable: role.mentionable,
            permissions: role.permissions,
        }
        let resolvedRoleId = targetRoleId
        if (targetRoleId) {
            await this.discordRequest({
                token,
                endpoint: `/guilds/${guildId}/roles/${targetRoleId}`,
                method: 'PATCH',
                body: payload,
            })
        } else {
            const created = await this.discordRequest<DiscordRoleResponse>({
                token,
                endpoint: `/guilds/${guildId}/roles`,
                method: 'POST',
                body: payload,
            })
            resolvedRoleId = created.id
        }
        if (!resolvedRoleId) return
        usedActualRoleIds.add(resolvedRoleId)
        if (resolvedRoleId !== role.id) {
            roleRemap.set(role.id, resolvedRoleId)
        }
    }

    private async applyOneChannel(params: {
        token: string
        guildId: string
        channel: ManifestChannel
        channelRemap: ChannelRemap
        actualChannels: ManifestChannel[]
        usedActualChannelIds: Set<string>
    }): Promise<void> {
        const { token, guildId, channel, channelRemap, actualChannels, usedActualChannelIds } = params
        const remappedParentId =
            (channel.parentId
                ? channelRemap.get(channel.parentId)
                : undefined) ?? channel.parentId
        const targetChannelId = this.resolveChannelTargetId({
            desiredChannelId: channel.id,
            desiredChannelName: channel.name,
            desiredChannelType: channel.type,
            desiredParentId: remappedParentId,
            actualChannels,
            usedActualChannelIds,
        })
        const payload = {
            name: channel.name,
            type: toDiscordChannelType(channel.type),
            parent_id: remappedParentId ?? null,
            topic: channel.topic ?? null,
        }
        let resolvedChannelId = targetChannelId
        if (targetChannelId) {
            await this.discordRequest({
                token,
                endpoint: `/channels/${targetChannelId}`,
                method: 'PATCH',
                body: payload,
            })
        } else {
            const created = await this.discordRequest<DiscordChannelResponse>({
                token,
                endpoint: `/guilds/${guildId}/channels`,
                method: 'POST',
                body: payload,
            })
            resolvedChannelId = created.id
        }
        if (!resolvedChannelId) return
        usedActualChannelIds.add(resolvedChannelId)
        if (resolvedChannelId !== channel.id) {
            channelRemap.set(channel.id, resolvedChannelId)
        }
    }

    private async pruneStaleRoles(
        token: string,
        guildId: string,
        desiredRoles: ManifestRole[],
        roleRemap: RoleRemap,
    ): Promise<void> {
        const latestRoles = await this.discordRequest<DiscordRoleResponse[]>({
            token,
            endpoint: `/guilds/${guildId}/roles`,
        })
        const desiredRoleIds = new Set(
            desiredRoles.map((role) => roleRemap.get(role.id) ?? role.id),
        )
        for (const role of latestRoles) {
            if (role.id === guildId || role.managed) continue
            if (desiredRoleIds.has(role.id)) continue
            try {
                await this.discordRequest({
                    token,
                    endpoint: `/guilds/${guildId}/roles/${role.id}`,
                    method: 'DELETE',
                })
            } catch (error) {
                if (!isExpectedDeleteError(error)) throw error
            }
        }
    }

    private async pruneStaleChannels(
        token: string,
        guildId: string,
        desiredChannels: ManifestChannel[],
        channelRemap: ChannelRemap,
    ): Promise<void> {
        const latestChannels = await this.discordRequest<DiscordChannelResponse[]>(
            {
                token,
                endpoint: `/guilds/${guildId}/channels`,
            },
        )
        const desiredChannelIds = new Set(
            desiredChannels.map(
                (channel) => channelRemap.get(channel.id) ?? channel.id,
            ),
        )
        for (const channel of latestChannels) {
            if (desiredChannelIds.has(channel.id)) continue
            try {
                await this.discordRequest({
                    token,
                    endpoint: `/channels/${channel.id}`,
                    method: 'DELETE',
                })
            } catch (error) {
                if (!isExpectedDeleteError(error)) throw error
            }
        }
    }

    private async applyRolesAndChannels(params: {
        token: string
        guildId: string
        desired: GuildAutomationManifestDocument
        actual: GuildAutomationManifestDocument
        allowProtected: boolean
        roleRemap: RoleRemap
        channelRemap: ChannelRemap
    }): Promise<void> {
        const desiredRoles = params.desired.roles?.roles ?? []
        const desiredChannels = params.desired.roles?.channels ?? []
        const actualRoles = params.actual.roles?.roles ?? []
        const actualChannels = params.actual.roles?.channels ?? []
        const usedActualRoleIds = new Set<string>()
        const usedActualChannelIds = new Set<string>()

        for (const role of desiredRoles) {
            await this.applyOneRole({
                token: params.token,
                guildId: params.guildId,
                role,
                actualRoles,
                usedActualRoleIds,
                roleRemap: params.roleRemap,
            })
        }

        const sortedChannels = [...desiredChannels].sort((a, b) => {
            const aPriority = a.type === 'GuildCategory' ? 0 : 1
            const bPriority = b.type === 'GuildCategory' ? 0 : 1
            if (aPriority !== bPriority) return aPriority - bPriority
            return a.id.localeCompare(b.id)
        })

        for (const channel of sortedChannels) {
            await this.applyOneChannel({
                token: params.token,
                guildId: params.guildId,
                channel,
                channelRemap: params.channelRemap,
                actualChannels,
                usedActualChannelIds,
            })
        }

        if (!params.allowProtected) return

        await this.pruneStaleRoles(
            params.token,
            params.guildId,
            desiredRoles,
            params.roleRemap,
        )
        await this.pruneStaleChannels(
            params.token,
            params.guildId,
            desiredChannels,
            params.channelRemap,
        )
    }
    private async applyReactionRoleRules(
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
            const key = `${(item as Record<string, unknown>).roleId}:${(item as Record<string, unknown>).excludedRoleId}`
            if (!nextPairs.has(key)) {
                await roleManagementService.removeExclusiveRole(
                    guildId,
                    (item as Record<string, unknown>).roleId as string,
                    (item as Record<string, unknown>).excludedRoleId as string,
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

    async captureGuildAutomationState(
        guildId: string,
    ): Promise<GuildAutomationManifestDocument> {
        const token = this.getBotToken()

        const [
            guild,
            roles,
            channels,
            onboarding,
            manifest,
            automodSettings,
            moderationSettings,
            welcomeMessage,
            leaveMessage,
            reactionRoleMessages,
            exclusiveRoles,
            roleGrants,
        ] = await Promise.all([
            this.discordRequest<DiscordGuildResponse>({
                token,
                endpoint: `/guilds/${guildId}`,
            }),
            this.discordRequest<DiscordRoleResponse[]>({
                token,
                endpoint: `/guilds/${guildId}/roles`,
            }),
            this.discordRequest<DiscordChannelResponse[]>({
                token,
                endpoint: `/guilds/${guildId}/channels`,
            }),
            this.fetchOnboarding(guildId, token),
            guildAutomationService.getManifest(guildId),
            autoModService.getSettings(guildId),
            getModerationSettings(guildId),
            autoMessageService.getWelcomeMessage(guildId),
            autoMessageService.getLeaveMessage(guildId),
            reactionRolesService.listReactionRoleMessages(guildId),
            roleManagementService.listExclusiveRoles(guildId),
            guildRoleAccessService.listRoleGrants(guildId),
        ])

        const manifestRoles = roles
            .filter((role) => role.id !== guildId)
            .map((role) => ({
                id: (role as Record<string, unknown>).id,
                name: (role as Record<string, unknown>).name,
                color: (role as Record<string, unknown>).color,
                hoist: (role as Record<string, unknown>).hoist,
                mentionable: (role as Record<string, unknown>).mentionable,
                permissions: (role as Record<string, unknown>).permissions,
            }))

        const manifestChannels = channels
            .filter((channel) => SUPPORTED_CHANNEL_TYPES.has(channel.type))
            .map((channel) => ({
                id: (channel as Record<string, unknown>).id,
                name: (channel as Record<string, unknown>).name,
                type: mapChannelType((channel as Record<string, unknown>).type as number),
                parentId: ((channel as Record<string, unknown>).parent_id as string | null) ?? null,
                topic: ((channel as Record<string, unknown>).topic as string | null) ?? null,
                readonly: false,
            }))

        const parity = ((manifest?.manifest as Record<string, unknown> | undefined)?.parity as typeof parity | undefined) ?? {
            shadowMode: true,
            externalBots: [],
            checklist: defaultParityChecklist(),
            cutoverReady: false,
        }

        return {
            version: manifest?.manifest.version ?? 1,
            guild: {
                id: guild.id,
                name: guild.name,
            },
            onboarding: this.toOnboardingManifest(onboarding),
            roles: {
                roles: manifestRoles,
                channels: manifestChannels,
            },
            moderation: {
                automod:
                    toAutoModPayload(
                        (automodSettings as Record<string, unknown> | null) ??
                            null,
                    ) ?? undefined,
                moderationSettings:
                    toModerationPayload(
                        (moderationSettings as Record<
                            string,
                            unknown
                        > | null) ?? null,
                    ) ?? undefined,
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
                    mappings: ((message.mappings as unknown) as Array<Record<string, unknown>>).map((mapping) => ({
                        roleId: mapping.roleId,
                        label: mapping.label ?? mapping.roleId,
                        emoji: mapping.emoji ?? undefined,
                        style: mapping.style ?? undefined,
                    })),
                })),
                exclusiveRoles: (exclusiveRoles as unknown as Array<Record<string, unknown>>).map((item) => ({
                    roleId: item.roleId,
                    excludedRoleId: item.excludedRoleId,
                })),
            },
            commandaccess: {
                grants: (roleGrants as unknown as Array<Record<string, unknown>>).map((grant) => ({
                    roleId: grant.roleId,
                    module: grant.module,
                    mode: grant.mode,
                })),
            },
            parity,
            source: DEFAULT_SOURCE,
            capturedAt: new Date().toISOString(),
        }
    }

    private async applyOnboardingModule(
        token: string,
        guildId: string,
        desired: GuildAutomationManifestDocument,
        appliedModules: string[],
    ): Promise<void> {
        const onboarding = desired.onboarding
        if (!onboarding) return
        await this.discordRequest({
            token,
            endpoint: `/guilds/${guildId}/onboarding`,
            method: 'PUT',
            body: {
                enabled: onboarding.enabled,
                mode: onboarding.mode,
                default_channel_ids: onboarding.defaultChannelIds,
                prompts: onboarding.prompts.map((prompt) => ({
                    id: prompt.id,
                    title: prompt.title,
                    single_select: prompt.singleSelect,
                    required: prompt.required,
                    in_onboarding: prompt.inOnboarding,
                    type: prompt.type,
                    options: prompt.options.map((option) => ({
                        id: option.id ?? null,
                        title: option.title,
                        description: option.description ?? null,
                        channel_ids: option.channelIds,
                        role_ids: option.roleIds,
                        emoji: option.emoji ?? null,
                    })),
                })),
            },
        })
        appliedModules.push('onboarding')
    }

    private async applyModerationModule(
        guildId: string,
        desired: GuildAutomationManifestDocument,
        appliedModules: string[],
    ): Promise<void> {
        const automodPayload = toAutoModPayload(desired.moderation?.automod)
        if (automodPayload) {
            await autoModService.updateSettings(guildId, automodPayload)
        }
        const moderationPayload = toModerationPayload(
            desired.moderation?.moderationSettings,
        )
        if (moderationPayload) {
            await updateModerationSettings(guildId, moderationPayload)
        }
        appliedModules.push('moderation')
    }

    private async applyAutoMessagesModule(
        guildId: string,
        desired: GuildAutomationManifestDocument,
        appliedModules: string[],
    ): Promise<void> {
        await this.upsertAutoMessage(guildId, 'welcome', desired.automessages?.welcome)
        await this.upsertAutoMessage(guildId, 'leave', desired.automessages?.leave)
        appliedModules.push('automessages')
    }

    private async applyReactionRolesModule(
        guildId: string,
        desired: GuildAutomationManifestDocument,
        appliedModules: string[],
        skippedModules: string[],
    ): Promise<void> {
        await this.applyReactionRoleRules(guildId, desired)
        if ((desired.reactionroles?.messages?.length ?? 0) > 0) {
            skippedModules.push(
                'reactionroles.messages requires manual message-template publish',
            )
        }
        appliedModules.push('reactionroles')
    }

    private async applyCommandAccessModule(
        guildId: string,
        desired: GuildAutomationManifestDocument,
        appliedModules: string[],
    ): Promise<void> {
        await guildRoleAccessService.replaceRoleGrants(
            guildId,
            desired.commandaccess?.grants ?? [],
        )
        appliedModules.push('commandaccess')
    }

    async executeApplyPlan(params: {
        guildId: string
        plan: GuildAutomationPlan
        desired: GuildAutomationManifestDocument
        actual: GuildAutomationManifestDocument
        allowProtected: boolean
    }): Promise<{
        diagnostics: Record<string, unknown>
        remappedManifest?: GuildAutomationManifestDocument
    }> {
        const token = this.getBotToken()
        const appliedModules: string[] = []
        const skippedModules: string[] = []
        const roleRemap: RoleRemap = new Map()
        const channelRemap: ChannelRemap = new Map()
        let effectiveDesired = params.desired

        if (shouldApplyModule(params.plan, 'onboarding', params.allowProtected)) {
            await this.applyOnboardingModule(token, params.guildId, effectiveDesired, appliedModules)
        }

        if (shouldApplyModule(params.plan, 'roles', params.allowProtected)) {
            await this.applyRolesAndChannels({
                token,
                guildId: params.guildId,
                desired: effectiveDesired,
                actual: params.actual,
                allowProtected: params.allowProtected,
                roleRemap,
                channelRemap,
            })
            if (roleRemap.size > 0 || channelRemap.size > 0) {
                effectiveDesired = this.remapManifestEntityIds({
                    manifest: effectiveDesired,
                    roleRemap,
                    channelRemap,
                })
            }
            appliedModules.push('roles')
        }

        if (shouldApplyModule(params.plan, 'moderation', params.allowProtected)) {
            await this.applyModerationModule(params.guildId, effectiveDesired, appliedModules)
        }

        if (shouldApplyModule(params.plan, 'automessages', params.allowProtected)) {
            await this.applyAutoMessagesModule(params.guildId, effectiveDesired, appliedModules)
        }

        if (shouldApplyModule(params.plan, 'reactionroles', params.allowProtected)) {
            await this.applyReactionRolesModule(params.guildId, effectiveDesired, appliedModules, skippedModules)
        }

        if (shouldApplyModule(params.plan, 'commandaccess', params.allowProtected)) {
            await this.applyCommandAccessModule(params.guildId, effectiveDesired, appliedModules)
        }

        if (shouldApplyModule(params.plan, 'parity', params.allowProtected)) {
            skippedModules.push('parity requires checklist/cutover workflow')
        }

        const diagnostics: Record<string, unknown> = {
            appliedModules,
            skippedModules,
            roleIdRemaps: Object.fromEntries(roleRemap.entries()),
            channelIdRemaps: Object.fromEntries(channelRemap.entries()),
        }

        debugLog({
            message: 'Guild automation apply execution completed',
            data: {
                guildId: params.guildId,
                appliedModules,
                skippedModules,
                remappedRoles: roleRemap.size,
                remappedChannels: channelRemap.size,
            },
        })

        return {
            diagnostics,
            remappedManifest:
                roleRemap.size > 0 || channelRemap.size > 0
                    ? effectiveDesired
                    : undefined,
        }
    }
}

export const guildAutomationExecutionService =
    new GuildAutomationExecutionService()
