import type { GuildQueue } from 'discord-player'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { addBreadcrumb } from '@lucky/shared/utils/monitoring'
import type { CustomClient } from '../../types'

export type QueueResolutionSource =
    | 'nodes.get'
    | 'queues.get'
    | 'nodes.resolve'
    | 'nodes.cache.get'
    | 'cache.guild'
    | 'cache.id'
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
    metadata?: {
        channel?: {
            guildId?: string
            guild?: { id?: string }
        }
    }
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

function emitTelemetry(source: QueueResolutionSource, cacheSize: number): void {
    try {
        addBreadcrumb('queue_resolution_source', 'queue_resolution', 'info', {
            source,
            cacheSize,
        })
    } catch {
        // Telemetry failures must never break queue resolution
    }
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

    emitTelemetry(source, diagnostics.cacheSize)

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

    // discord-player v7.x: nodes.resolve performs lazy initialization of a GuildQueue
    // if missing; it's redundant with nodes.get when the queue already exists but
    // returns a fresh instance if the backing store has the queue but nodes.get misses.
    const fromNodesResolve = toGuildQueue(nodes?.resolve?.(guildId))
    if (fromNodesResolve) {
        return resolveWithSource(fromNodesResolve, 'nodes.resolve', diagnostics)
    }

    const fromCacheGet = toGuildQueue(cache?.get?.(guildId))
    if (fromCacheGet) {
        return resolveWithSource(fromCacheGet, 'nodes.cache.get', diagnostics)
    }

    if (cache) {
        // Guild ID is more authoritative: check it first (path 5)
        const fromCacheGuild = resolveByCacheScan(
            cache,
            (queue) =>
                queue.guild?.id === guildId ||
                queue.metadata?.channel?.guildId === guildId ||
                queue.metadata?.channel?.guild?.id === guildId,
        )
        if (fromCacheGuild) {
            return resolveWithSource(fromCacheGuild, 'cache.guild', diagnostics)
        }

        // Queue ID scan is less authoritative (path 6)
        const fromCacheId = resolveByCacheScan(
            cache,
            (queue) => queue.id === guildId,
        )
        if (fromCacheId) {
            return resolveWithSource(fromCacheId, 'cache.id', diagnostics)
        }
    }

    const log = diagnostics.cacheSize > 0 ? warnLog : debugLog
    log({
        message: 'Unable to resolve guild queue',
        data: diagnostics,
    })

    return resolveWithSource(null, 'miss', diagnostics)
}
