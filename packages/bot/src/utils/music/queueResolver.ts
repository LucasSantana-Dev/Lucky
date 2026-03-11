import type { GuildQueue } from 'discord-player'
import { debugLog, warnLog } from '@lucky/shared/utils'
import type { CustomClient } from '../../types'

export type QueueResolutionSource =
    | 'nodes.get'
    | 'queues.get'
    | 'nodes.resolve'
    | 'nodes.cache.get'
    | 'cache.id'
    | 'cache.guild'
    | 'miss'

export type QueueResolutionDiagnostics = {
    guildId: string
    cacheSize: number
    cacheSampleKeys: string[]
}

export type QueueResolutionResult = {
    queue: GuildQueue | null
    source: QueueResolutionSource
    diagnostics: QueueResolutionDiagnostics
}

type QueueNodeLike = {
    id?: string
    guild?: { id?: string }
}

type QueueCacheLike = {
    size?: number
    get?: (_guildId: string) => QueueNodeLike | null | undefined
    keys?: () => Iterable<string>
    values?: () => Iterable<QueueNodeLike | null | undefined>
}

type QueueManagerLike = {
    get?: (_guildId: string) => QueueNodeLike | null | undefined
}

type NodeManagerLike = {
    get?: (_guildId: string) => QueueNodeLike | null | undefined
    resolve?: (_guildId: string) => QueueNodeLike | null | undefined
    cache?: QueueCacheLike
}

type PlayerLike = {
    nodes?: NodeManagerLike
    queues?: QueueManagerLike
}

function toGuildQueue(
    value: QueueNodeLike | null | undefined,
): GuildQueue | null {
    if (!value) return null
    return value as GuildQueue
}

function buildDiagnostics(
    cache: QueueCacheLike | undefined,
    guildId: string,
): QueueResolutionDiagnostics {
    const keys = cache?.keys ? Array.from(cache.keys()) : []
    return {
        guildId,
        cacheSize: cache?.size ?? keys.length,
        cacheSampleKeys: keys.slice(0, 5),
    }
}

function resolveByCacheScan(
    cache: QueueCacheLike,
    matcher: (_queue: QueueNodeLike) => boolean,
): GuildQueue | null {
    if (!cache.values) return null

    for (const candidate of cache.values()) {
        if (!candidate) continue
        if (matcher(candidate)) {
            return candidate as GuildQueue
        }
    }

    return null
}

function resolveWithSource(
    queue: GuildQueue | null,
    source: QueueResolutionSource,
    diagnostics: QueueResolutionDiagnostics,
): QueueResolutionResult {
    if (queue) {
        debugLog({
            message: 'Resolved guild queue',
            data: {
                guildId: diagnostics.guildId,
                source,
            },
        })
    }

    return { queue, source, diagnostics }
}

export function resolveGuildQueue(
    client: Pick<CustomClient, 'player'>,
    guildId: string,
): QueueResolutionResult {
    const player = client.player as unknown as PlayerLike
    const nodes = player?.nodes
    const queues = player?.queues
    const cache = nodes?.cache
    const diagnostics = buildDiagnostics(cache, guildId)

    const fromNodesGet = toGuildQueue(nodes?.get?.(guildId))
    if (fromNodesGet) {
        return resolveWithSource(fromNodesGet, 'nodes.get', diagnostics)
    }

    const fromQueuesGet = toGuildQueue(queues?.get?.(guildId))
    if (fromQueuesGet) {
        return resolveWithSource(fromQueuesGet, 'queues.get', diagnostics)
    }

    const fromNodesResolve = toGuildQueue(nodes?.resolve?.(guildId))
    if (fromNodesResolve) {
        return resolveWithSource(fromNodesResolve, 'nodes.resolve', diagnostics)
    }

    const fromCacheGet = toGuildQueue(cache?.get?.(guildId))
    if (fromCacheGet) {
        return resolveWithSource(fromCacheGet, 'nodes.cache.get', diagnostics)
    }

    if (cache) {
        const fromCacheId = resolveByCacheScan(
            cache,
            (queue) => queue.id === guildId,
        )
        if (fromCacheId) {
            return resolveWithSource(fromCacheId, 'cache.id', diagnostics)
        }

        const fromCacheGuild = resolveByCacheScan(
            cache,
            (queue) => queue.guild?.id === guildId,
        )
        if (fromCacheGuild) {
            return resolveWithSource(fromCacheGuild, 'cache.guild', diagnostics)
        }
    }

    warnLog({
        message: 'Unable to resolve guild queue',
        data: diagnostics,
    })

    return {
        queue: null,
        source: 'miss',
        diagnostics,
    }
}
