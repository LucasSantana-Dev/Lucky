import {
    guildRoleAccessService,
    type AccessMode,
    type EffectiveAccessMap,
    type ModuleKey,
} from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import {
    DiscordApiError,
    discordOAuthService,
    type DiscordGuild,
} from './DiscordOAuthService'
import { guildService, type GuildWithBotStatus } from './GuildService'
import type { SessionData } from './SessionService'
import { AppError } from '../errors/AppError'

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
    private extractStatusCode(error: unknown): number | null {
        if (error instanceof DiscordApiError) {
            return error.statusCode
        }

        if (typeof error === 'object' && error !== null) {
            const objectError = error as {
                statusCode?: unknown
                status?: unknown
            }

            if (typeof objectError.statusCode === 'number') {
                return objectError.statusCode
            }

            if (typeof objectError.status === 'number') {
                return objectError.status
            }
        }

        return null
    }

    private async fetchUserGuilds(
        session: SessionData,
    ): Promise<DiscordGuild[]> {
        try {
            return await discordOAuthService.getUserGuilds(session.accessToken)
        } catch (error) {
            const statusCode = this.extractStatusCode(error)

            if (statusCode === 401) {
                throw AppError.unauthorized(
                    'Discord session expired. Please sign in again.',
                )
            }

            if (statusCode === 403) {
                throw AppError.forbidden(
                    'Discord OAuth scope is missing. Re-authenticate and try again.',
                )
            }

            if (
                statusCode === 429 ||
                (statusCode !== null && statusCode >= 500)
            ) {
                throw new AppError(
                    502,
                    'Discord API is temporarily unavailable. Please retry.',
                )
            }

            throw error
        }
    }

    private async buildContext(
        guild: DiscordGuild,
        userId: string,
    ): Promise<GuildAccessContext> {
        const isAdmin =
            guild.owner ||
            discordOAuthService.hasAdminPermission(
                guild.permissions,
                guild.permissions_new,
            )

        const hasBot = isAdmin
            ? true
            : await guildService.hasBotInGuild(guild.id)
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
        const guilds = await this.fetchUserGuilds(session)
        const contexts = await Promise.all(
            guilds.map(async (guild) => {
                try {
                    return await this.buildContext(guild, session.user.id)
                } catch (error) {
                    errorLog({
                        message: 'Skipping guild due access context failure',
                        error,
                        data: { guildId: guild.id, userId: session.user.id },
                    })
                    return null
                }
            }),
        )

        const resolvedContexts = contexts.filter(
            (context): context is GuildAccessContext => context !== null,
        )
        if (guilds.length > 0 && resolvedContexts.length === 0) {
            throw new AppError(
                502,
                'Unable to resolve server access right now. Please retry.',
            )
        }

        const authorizedContexts = resolvedContexts.filter((context) =>
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
        const guilds = await this.fetchUserGuilds(session)
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
