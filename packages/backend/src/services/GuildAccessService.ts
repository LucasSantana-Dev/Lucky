import { createHash } from 'node:crypto'
import {
    GuildRoleGrantStorageError,
    guildRoleAccessService,
    type AccessMode,
    type EffectiveAccessMap,
    type ModuleKey,
} from '@lucky/shared/services'
import { errorLog, warnLog } from '@lucky/shared/utils'
import { TtlCache } from '@lucky/shared/utils/cache'
import {
    DiscordApiError,
    discordOAuthService,
    type DiscordGuild,
} from './DiscordOAuthService'
import {
    guildService,
    type GuildMemberContext,
    type GuildWithBotStatus,
} from './GuildService'
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
    /**
     * Raw Discord permissions bitfield (numeric string) the user holds in
     * this guild, from Discord's own OAuth guild list. Distinct from
     * `isAdmin` (which also treats MANAGE_GUILD as admin-equivalent for
     * dashboard access) — used to cap what a non-admin can grant a role
     * (#2451), where only real Discord Administrator/owner should bypass.
     */
    permissions: string
}

export interface AuthorizedGuild extends GuildWithBotStatus {
    effectiveAccess: EffectiveAccessMap
    canManageRbac: boolean
}

/** Max guild contexts resolved at once per request, so a user in many guilds
 * does not fan out one Discord member lookup per guild simultaneously. */
const CONTEXT_CONCURRENCY = 5

async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++
            results[index] = await fn(items[index])
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker),
    )
    return results
}

class GuildAccessService {
    private readonly userGuildCacheTtlSeconds = 30
    private readonly userGuildCache = new TtlCache<DiscordGuild[]>({
        ttlMs: this.userGuildCacheTtlSeconds * 1000,
        maxEntries: 1000,
    })
    private readonly userGuildsInFlight = new Map<
        string,
        Promise<DiscordGuild[]>
    >()
    /**
     * Discord member roles per (user, guild). Kept as short as the guild-list
     * cache so a role removed in Discord stops granting access within 30s.
     * Effective access is still resolved from grants on every request.
     */
    private readonly memberContextCache = new TtlCache<GuildMemberContext>({
        ttlMs: this.userGuildCacheTtlSeconds * 1000,
        maxEntries: 5000,
    })
    private readonly memberContextInFlight = new Map<
        string,
        Promise<GuildMemberContext>
    >()
    /** Bumped on reset so a lookup started before it cannot repopulate. */
    private memberContextGeneration = 0

    private getCacheKey(session: SessionData): string {
        const accessTokenFingerprint = createHash('sha256')
            .update(session.accessToken)
            .digest('hex')
            .slice(0, 16)

        return `guild-access:user-guilds:${session.user.id}:${accessTokenFingerprint}`
    }

    private getCachedGuilds(session: SessionData): DiscordGuild[] | null {
        return this.userGuildCache.get(this.getCacheKey(session)) ?? null
    }

    private setCachedGuilds(
        session: SessionData,
        guilds: DiscordGuild[],
    ): void {
        this.userGuildCache.set(this.getCacheKey(session), guilds)
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
        const cached = this.getCachedGuilds(session)
        if (cached) {
            return cached
        }

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
                this.setCachedGuilds(session, guilds)
                return guilds
            } catch (error) {
                const statusCode = this.extractStatusCode(error)
                const cachedGuilds = this.getCachedGuilds(session)

                if (
                    allowCachedFallback &&
                    cachedGuilds &&
                    (statusCode === 429 ||
                        (statusCode !== null && statusCode >= 500))
                ) {
                    warnLog({
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
        this.userGuildCache.clear()
        this.memberContextInFlight.clear()
        this.memberContextCache.clear()
        this.memberContextGeneration += 1
    }

    private async getMemberContext(
        guildId: string,
        userId: string,
    ): Promise<GuildMemberContext> {
        const key = `${userId}:${guildId}`
        const cached = this.memberContextCache.get(key)
        if (cached) {
            return cached
        }

        const inFlight = this.memberContextInFlight.get(key)
        if (inFlight) {
            return inFlight
        }

        const generation = this.memberContextGeneration
        const request: Promise<GuildMemberContext> = guildService
            .fetchGuildMemberContext(guildId, userId)
            .then((context) => {
                // A failed lookup (null) is not cached, so a transient
                // Discord error is not pinned for the whole TTL.
                if (context === null) {
                    return { nickname: null, roleIds: [] }
                }
                if (generation === this.memberContextGeneration) {
                    this.memberContextCache.set(key, context)
                }
                return context
            })
            .finally(() => {
                if (this.memberContextInFlight.get(key) === request) {
                    this.memberContextInFlight.delete(key)
                }
            })

        this.memberContextInFlight.set(key, request)
        return request
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
        const permissions = discordOAuthService.getPermissionsBitfield(
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
                permissions,
            }
        }

        const hasBot = await guildService.hasBotInGuild(guild.id)
        const memberContext = hasBot
            ? await this.getMemberContext(guild.id, userId)
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
            permissions,
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
        const contexts = await mapWithConcurrency(
            guilds,
            CONTEXT_CONCURRENCY,
            async (guild) => {
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
            },
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
