import type { Express, Request, Response as ExpressResponse } from 'express'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { timingSafeKeyCompare } from '../utils/timingSafeKeyCompare'

function requireMembersKey(req: Request): void {
    const provided = req.header('x-members-key')?.trim()
    const expected = process.env.LUCKY_MEMBERS_API_KEY
    if (!timingSafeKeyCompare(provided, expected)) {
        throw AppError.unauthorized('invalid members key')
    }
}

function getGuildId(): string {
    return process.env.CRIATIVARIA_GUILD_ID || '895505900016631839'
}

function validateSnowflake(value: string): boolean {
    return /^\d{17,20}$/.test(value)
}

function sanitizeQuery(query: string): string {
    // Remove control characters
    return query.replace(/[\x00-\x1F\x7F]/g, '').trim()
}

type DiscordUser = {
    id: string
    username: string
    global_name: string | null
    avatar: string | null
}

type DiscordMember = {
    user: DiscordUser
    nick: string | null
    roles: string[]
    joined_at: string
}

type MemberResponse = {
    id: string
    username: string
    globalName: string | null
    nick: string | null
    avatar: string | null
    roles: string[]
    joinedAt: string
}

type DiscordRole = {
    id: string
    name: string
    color: number
    position: number
    hoist: boolean
}

type RoleResponse = {
    id: string
    name: string
    color: number
    position: number
    hoist: boolean
}

async function discordFetch(url: string, method: string): Promise<Response> {
    const token = process.env.DISCORD_TOKEN
    if (!token) {
        throw new AppError(500, 'Discord token not configured')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        })
        return response
    } finally {
        clearTimeout(timeout)
    }
}

function mapMember(member: DiscordMember): MemberResponse {
    return {
        id: member.user.id,
        username: member.user.username,
        globalName: member.user.global_name ?? null,
        nick: member.nick ?? null,
        avatar: member.user.avatar ?? null,
        roles: member.roles,
        joinedAt: member.joined_at,
    }
}

function mapRole(role: DiscordRole): RoleResponse {
    return {
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        hoist: role.hoist,
    }
}

export function setupServiceGuildRoutes(app: Express): void {
    app.get(
        '/api/service/guild/members',
        writeLimiter,
        asyncHandler(async (req: Request, res: ExpressResponse) => {
            requireMembersKey(req)

            const guildId = getGuildId()

            // Parse and validate query parameters
            const limitParam = req.query.limit as string | undefined
            const afterParam = req.query.after as string | undefined
            const queryParam = req.query.query as string | undefined

            let limit = 50
            if (limitParam !== undefined) {
                const parsed = parseInt(limitParam, 10)
                if (isNaN(parsed) || parsed < 1 || parsed > 100) {
                    throw AppError.badRequest('limit must be 1-100')
                }
                limit = parsed
            }

            if (afterParam !== undefined && !validateSnowflake(afterParam)) {
                throw AppError.badRequest('invalid after snowflake')
            }

            let sanitizedQuery: string | undefined
            if (queryParam !== undefined) {
                if (queryParam.length < 1 || queryParam.length > 32) {
                    throw AppError.badRequest('query must be 1-32 characters')
                }
                sanitizedQuery = sanitizeQuery(queryParam)
            }

            // Build Discord API URL
            let url: string
            if (sanitizedQuery) {
                // Use search endpoint
                const searchParams = new URLSearchParams()
                searchParams.append('query', sanitizedQuery)
                searchParams.append('limit', limit.toString())
                url = `https://discord.com/api/v10/guilds/${guildId}/members/search?${searchParams.toString()}`
            } else {
                // Use list endpoint
                const listParams = new URLSearchParams()
                listParams.append('limit', limit.toString())
                if (afterParam) {
                    listParams.append('after', afterParam)
                }
                url = `https://discord.com/api/v10/guilds/${guildId}/members?${listParams.toString()}`
            }

            const response = await discordFetch(url, 'GET')

            if (!response.ok) {
                console.error(
                    `Discord API error: ${response.status} ${response.statusText}`,
                )
                throw AppError.badGateway(`discord ${response.status}`)
            }

            const members = (await response.json()) as DiscordMember[]
            const mapped = members.map(mapMember)

            res.json({ members: mapped })
        }),
    )

    app.get(
        '/api/service/guild/members/:userId',
        writeLimiter,
        asyncHandler(async (req: Request, res: ExpressResponse) => {
            requireMembersKey(req)

            const userId = String(req.params.userId ?? '')
            if (!validateSnowflake(userId)) {
                throw AppError.badRequest('invalid user id')
            }

            const guildId = getGuildId()
            const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`

            const response = await discordFetch(url, 'GET')

            if (response.status === 404) {
                throw AppError.notFound('member not found')
            }
            if (!response.ok) {
                console.error(
                    `Discord API error: ${response.status} ${response.statusText}`,
                )
                throw AppError.badGateway(`discord ${response.status}`)
            }

            const member = (await response.json()) as DiscordMember
            res.json({ member: mapMember(member) })
        }),
    )

    app.get(
        '/api/service/guild/roles',
        writeLimiter,
        asyncHandler(async (req: Request, res: ExpressResponse) => {
            requireMembersKey(req)

            const guildId = getGuildId()
            const url = `https://discord.com/api/v10/guilds/${guildId}/roles`

            const response = await discordFetch(url, 'GET')

            if (!response.ok) {
                console.error(
                    `Discord API error: ${response.status} ${response.statusText}`,
                )
                throw AppError.badGateway(`discord ${response.status}`)
            }

            const roles = (await response.json()) as DiscordRole[]
            const mapped = roles
                .map(mapRole)
                .sort((a, b) => b.position - a.position)

            res.json({ roles: mapped })
        }),
    )
}
