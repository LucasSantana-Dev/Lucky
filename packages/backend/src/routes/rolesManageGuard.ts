import type { Request } from 'express'

/**
 * `/api/guilds/:guildId/roles/manage/*` has its own `settings:manage` guard
 * (see guildGuardConfigs in routes/index.ts). It must never fall under
 * `/roles`' `automation` guard, since PATCH/POST there accepts an arbitrary
 * Discord permissions bitfield (roleUpsertBody), and a caller who could
 * reach it via only `automation` access could grant a role Administrator,
 * escalating to every module (DiscordOAuthService.hasAdminPermission /
 * GuildAccessService.buildContext treat Administrator as guild-wide admin).
 *
 * Kept in its own file (rather than inline in routes/index.ts) so this
 * security-critical predicate can be unit tested without importing the full
 * route graph.
 *
 * Express strips the mounted `/api/guilds/:guildId/roles` prefix before
 * calling a middleware registered on that path, so `req.path` here is
 * relative (`/manage`, `/manage/:roleId`, ...); compare lower-cased since
 * Express route matching is case-insensitive by default.
 */
export function isRolesManagePath(req: Request): boolean {
    const path = req.path.toLowerCase()
    return path === '/manage' || path.startsWith('/manage/')
}
