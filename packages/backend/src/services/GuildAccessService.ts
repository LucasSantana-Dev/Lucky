import { createHash } from 'node:crypto'
import {
    GuildRoleGrantStorageError,
    guildRoleAccessService,
    redisClient,
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
    botPresenceChecked: boolean
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
    private readonly userGuildCacheTtlSeconds = 30
    private readonly userGuildsInFlight = new Map<
        string,
        Promise<DiscordGuild[]>
    >()

    private isDiscordGuildArray(value: unknown): value is DiscordGuild[] {
        return (
            Array.isArray(value) &&
            value.every((item) => {
                if (typeof item !== 'object' || item === null) {
                    return false
                }

                const guild = item as {
                    id?: unknown
                    name?: unknown
                }

                return (
                    typeof guild.id === 'string' &&
                    typeof guild.name === 'string'
                )
            })
        )
    }

    private getCacheKey(session: SessionData): string {
        const accessTokenFingerprint = createHash('sha256')
            .update(session.accessToken)
            .digest('hex')
            .slice(0, 16)

        return `guild-access:user-guilds:${session.user.id}:${accessTokenFingerprint}`
    }

    private async getCachedGuilds(
        session: SessionData,
    ): Promise<DiscordGuild[] | null> {
        if (!redisClient.isHealthy()) {
            return null
        }

        try {
            const raw = await redisClient.get(this.getCacheKey(session))
            if (!raw) {
                return null
            }

            const parsed: unknown = JSON.parse(raw)
            if (!this.isDiscordGuildArray(parsed)) {
                return null
            }

            return parsed
        } catch (error) {
            errorLog({
                message: 'Failed to read cached Discord guild list',
                error,
                data: { userId: session.user.id },
            })
            return null
        }
    }

    private async setCachedGuilds(
        session: SessionData,
        guilds: DiscordGuild[],
    ): Promise<void> {
        if (!redisClient.isHealthy()) {
            return
        }

        try {
            await redisClient.setex(
                this.getCacheKey(session),
                this.userGuildCacheTtlSeconds,
                JSON.stringify(guilds),
            )
        } catch (error) {
            errorLog({
                message: 'Failed to cache Discord guild list',
                error,
                data: { userId: session.user.id, guildCount: guilds.length },
            })
        }
    }

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
        options?: { allowCachedFallback?: boolean },
    ): Promise<DiscordGuild[]> {
        const allowCachedFallback = options?.allowCachedFallback ?? true
        const cacheKey = this.getCacheKey(session)
        const inFlight = this.userGuildsInFlight.get(cacheKey)
        if (inFlight) {
            return inFlight
        }

        const request = (async () => {
            try {
                const guilds = await discordOAuthService.getUserGuilds(
                    session.accessToken,
                )
                await this.setCachedGuilds(session, guilds)
                return guilds
            } catch (error) {
                const statusCode = this.extractStatusCode(error)
                const cachedGuilds = await this.getCachedGuilds(session)

                if (
                    allowCachedFallback &&
                    cachedGuilds &&
                    (statusCode === 429 ||
                        (statusCode !== null && statusCode >= 500))
                ) {
                    errorLog({
                        message:
                            'Using cached guild list after Discord guild fetch failure',
                        data: {
                            userId: session.user.id,
                            statusCode,
                            guildCount: cachedGuilds.length,
                        },
                    })
                    return cachedGuilds
                }

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
        })().finally(() => {
            this.userGuildsInFlight.delete(cacheKey)
        })

        this.userGuildsInFlight.set(cacheKey, request)
        return request
    }

    resetCachesForTests(): void {
        this.userGuildsInFlight.clear()
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
        if (isAdmin) {
            const effectiveAccess =
                await guildRoleAccessService.resolveEffectiveAccess(
                    guild.id,
                    [],
                    true,
                )

            return {
                guildId: guild.id,
                owner: guild.owner,
                isAdmin,
                hasBot: false,
                botPresenceChecked: false,
                roleIds: [],
                nickname: null,
                effectiveAccess,
                canManageRbac: true,
            }
        }

        const hasBot = await guildService.hasBotInGuild(guild.id)
        const memberContext = hasBot
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
            botPresenceChecked: true,
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

        if (!context.botPresenceChecked || !context.hasBot) {
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
                    if (error instanceof GuildRoleGrantStorageError) {
                        throw new AppError(
                            503,
                            'RBAC storage is unavailable. Run database migrations and retry.',
                        )
                    }
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

        let context: GuildAccessContext
        try {
            context = await this.buildContext(guild, session.user.id)
        } catch (error) {
            if (error instanceof GuildRoleGrantStorageError) {
                throw new AppError(
                    503,
                    'RBAC storage is unavailable. Run database migrations and retry.',
                )
            }
            errorLog({
                message: 'Failed to resolve guild context',
                error,
                data: { guildId, userId: session.user.id },
            })
            throw new AppError(
                502,
                'Unable to resolve server access right now. Please retry.',
            )
        }
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
