import {
    guildRoleAccessService,
    type AccessMode,
    type EffectiveAccessMap,
    type ModuleKey,
} from '@lucky/shared/services'
import { discordOAuthService, type DiscordGuild } from './DiscordOAuthService'
import { guildService, type GuildWithBotStatus } from './GuildService'
import type { SessionData } from './SessionService'

export interface GuildAccessContext {
    guildId: string
    owner: boolean
    isAdmin: boolean
    hasBot: boolean
    roleIds: string[]
    nickname: string | null
    effectiveAccess: EffectiveAccessMap
    canManageRbac: boolean
}

export interface AuthorizedGuild extends GuildWithBotStatus {
    effectiveAccess: EffectiveAccessMap
    canManageRbac: boolean
}

class GuildAccessService {
    private async fetchUserGuilds(
        accessToken: string,
    ): Promise<DiscordGuild[]> {
        return discordOAuthService.getUserGuilds(accessToken)
    }

    private async buildContext(
        guild: DiscordGuild,
        userId: string,
    ): Promise<GuildAccessContext> {
        const isAdmin =
            guild.owner ||
            discordOAuthService.hasAdminPermission(guild.permissions)
        const hasBot = await guildService.hasBotInGuild(guild.id)
        const memberContext =
            hasBot && !isAdmin
                ? await guildService.getGuildMemberContext(guild.id, userId)
                : { nickname: null, roleIds: [] as string[] }

        const effectiveAccess =
            await guildRoleAccessService.resolveEffectiveAccess(
                guild.id,
                memberContext.roleIds,
                isAdmin,
            )

        return {
            guildId: guild.id,
            owner: guild.owner,
            isAdmin,
            hasBot,
            roleIds: memberContext.roleIds,
            nickname: memberContext.nickname,
            effectiveAccess,
            canManageRbac: isAdmin,
        }
    }

    private isAuthorized(context: GuildAccessContext): boolean {
        if (context.isAdmin) {
            return true
        }

        if (!context.hasBot) {
            return false
        }

        return guildRoleAccessService.hasAnyAccess(context.effectiveAccess)
    }

    async listAuthorizedGuilds(
        session: SessionData,
    ): Promise<AuthorizedGuild[]> {
        const guilds = await this.fetchUserGuilds(session.accessToken)
        const contexts = await Promise.all(
            guilds.map((guild) => this.buildContext(guild, session.user.id)),
        )

        const authorizedContexts = contexts.filter((context) =>
            this.isAuthorized(context),
        )
        const authorizedContextByGuildId = new Map(
            authorizedContexts.map((context) => [context.guildId, context]),
        )

        const authorizedGuilds = guilds.filter((guild) =>
            authorizedContextByGuildId.has(guild.id),
        )
        const enrichedGuilds =
            await guildService.enrichGuildsWithBotStatus(authorizedGuilds)

        return enrichedGuilds.map((guild) => {
            const context = authorizedContextByGuildId.get(guild.id)
            if (!context) {
                throw new Error(
                    `Missing authorized context for guild ${guild.id}`,
                )
            }

            return {
                ...guild,
                effectiveAccess: context.effectiveAccess,
                canManageRbac: context.canManageRbac,
            }
        })
    }

    async resolveGuildContext(
        session: SessionData,
        guildId: string,
    ): Promise<GuildAccessContext | null> {
        const guilds = await this.fetchUserGuilds(session.accessToken)
        const guild = guilds.find((item) => item.id === guildId)

        if (!guild) {
            return null
        }

        const context = await this.buildContext(guild, session.user.id)
        if (!this.isAuthorized(context)) {
            return null
        }

        return context
    }

    hasAccess(
        context: GuildAccessContext,
        module: ModuleKey,
        requiredMode: AccessMode,
    ): boolean {
        return guildRoleAccessService.hasAccess(
            context.effectiveAccess,
            module,
            requiredMode,
        )
    }
}

export const guildAccessService = new GuildAccessService()
