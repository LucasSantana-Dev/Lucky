import type { GuildQueue, Track } from 'discord-player'
import { QueryType } from 'discord-player'
import type { User } from 'discord.js'
import { randomUUID } from 'crypto'
import {
    getPrismaClient,
    getDbNull,
    debugLog,
    errorLog,
    infoLog,
    warnLog,
} from '@lucky/shared/utils'
import type { Prisma } from '@lucky/shared/utils'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { trackSource } from '../../utils/music/trackFields'
import { isHostedYoutubeEnabled } from '../../config/featureFlags'
import { isHost } from '../../utils/general/urlHost'
import { textSearchBlockOptions } from '../../functions/music/commands/play/handlers/resolveProvider'

/**
 * Extracts the structured Prisma error fields (`code` + `meta`) for logging.
 * Prisma's `KnownRequestError.message` is truncated ("Invalid `…create()`
 * invocation:") and hides the offending field; the code (e.g. P2003) + meta
 * carry the real cause. Returns undefined for non-Prisma errors.
 */
function prismaErrorMeta(error: unknown): Record<string, unknown> | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
        const e = error as { code?: unknown; meta?: unknown }
        return { prismaCode: e.code, prismaMeta: e.meta }
    }
    return undefined
}

export type SnapshotTrack = {
    title: string
    author: string
    url: string
    duration: string
    source: string
    recommendationReason?: string
    isAutoplay?: boolean
    requestedById?: string
    // Current track only (#3151): where playback was when the snapshot was
    // saved, the track length in ms, and whether the queue was paused.
    positionMs?: number
    durationMs?: number
    paused?: boolean
}

export type QueueSessionSnapshot = {
    sessionSnapshotId: string
    guildId: string
    savedAt: number
    currentTrack: SnapshotTrack | null
    upcomingTracks: SnapshotTrack[]
    voiceChannelId?: string
}

export type SnapshotRestoreResult = {
    restoredCount: number
    sessionSnapshotId: string | null
    /**
     * Tracks skipped because they're youtube.com/youtu.be entries and
     * HOSTED_YOUTUBE_ENABLED is false (no YouTube extractor registered, so a
     * search for them is a guaranteed miss). See #2486.
     */
    skippedYoutubeCount: number
}

const MAX_SNAPSHOT_TRACKS = 25

/** Maximum age in ms for a snapshot to be automatically restored (30 minutes). */
const DEFAULT_MAX_SNAPSHOT_AGE_MS = 30 * 60 * 1_000

/** A current track with less than this left is skipped on restore (#3151). */
const MIN_REMAINING_TO_RESUME_MS = 15_000

/** Positions below this restart from the top instead of seeking. */
const MIN_SEEK_MS = 5_000

/** How often playing queues are re-saved, so a crash loses little progress. */
export const SNAPSHOT_AUTOSAVE_INTERVAL_MS = 30_000

function durationStringToMs(duration: string): number | null {
    const parts = duration.split(':').map(Number)
    if (parts.length < 2 || parts.length > 3) return null
    if (parts.some((p) => !Number.isFinite(p))) return null
    const seconds = parts.reduce((total, part) => total * 60 + part, 0)
    return seconds > 0 ? seconds * 1_000 : null
}

function trackLengthMs(track: SnapshotTrack): number | null {
    if (typeof track.durationMs === 'number' && track.durationMs > 0) {
        return track.durationMs
    }
    return durationStringToMs(track.duration)
}

type CurrentTrackPlan = { restore: false } | { restore: true; seekMs: number }

/**
 * Decides how the snapshot's current track comes back after a restart (#3151):
 * from its saved position, from the top, or not at all. A track is dropped when
 * little of it is left, or when it would already have ended had it kept
 * playing since the save (a legacy snapshot without a position counts from
 * 0:00, the most generous assumption). A paused track does not advance, so
 * only the first rule applies to it.
 */
function planCurrentTrack(
    track: SnapshotTrack,
    savedAt: number,
    now: number,
): CurrentTrackPlan {
    const positionMs = Math.max(0, track.positionMs ?? 0)
    const seekMs = positionMs >= MIN_SEEK_MS ? positionMs : 0
    const lengthMs = trackLengthMs(track)
    if (lengthMs === null) return { restore: true, seekMs }

    const remainingMs = lengthMs - positionMs
    if (
        track.positionMs !== undefined &&
        remainingMs < MIN_REMAINING_TO_RESUME_MS
    ) {
        return { restore: false }
    }
    if (!track.paused && now - savedAt > remainingMs) {
        return { restore: false }
    }
    return { restore: true, seekMs }
}

type SearchOptions = {
    requestedBy?: User
    searchEngine: QueryType
}

/** Row shape this service reads from the `music_session_snapshots` table. */
interface SnapshotRow {
    sessionSnapshotId: string
    guildId: string
    savedAt: Date
    currentTrack: unknown
    upcomingTracks: unknown
    voiceChannelId: string | null
}

function toDurationString(duration: unknown): string {
    if (typeof duration === 'string') return duration
    if (typeof duration === 'number') return String(duration)
    return '0:00'
}

export function toSnapshotTrack(track: Track): SnapshotTrack {
    const metadata = (track.metadata ?? {}) as {
        recommendationReason?: string
        isAutoplay?: boolean
        requestedById?: string
    }

    return {
        title: track.title,
        author: track.author,
        url: track.url,
        duration: toDurationString(track.duration),
        source: trackSource(track) ?? 'unknown',
        recommendationReason: metadata.recommendationReason,
        isAutoplay: metadata.isAutoplay,
        requestedById: metadata.requestedById,
    }
}

/** Position, length and paused state of the playing track, when the node knows them. */
function playbackState(
    queue: GuildQueue,
    track: Track,
): Pick<SnapshotTrack, 'positionMs' | 'durationMs' | 'paused'> {
    const state: Pick<SnapshotTrack, 'positionMs' | 'durationMs' | 'paused'> =
        {}
    const position = queue.node?.playbackTime
    if (typeof position === 'number' && Number.isFinite(position)) {
        state.positionMs = Math.max(0, Math.round(position))
    }
    if (typeof track.durationMS === 'number' && track.durationMS > 0) {
        state.durationMs = track.durationMS
    }
    if (typeof queue.node?.isPaused === 'function') {
        state.paused = queue.node.isPaused()
    }
    return state
}

function applySnapshotMetadata(
    track: Track,
    snapshotId: string,
    recommendationReason?: string,
    isAutoplay?: boolean,
    requestedById?: string,
): void {
    const existing = (track.metadata ?? {}) as Record<string, unknown>
    track.setMetadata({
        ...existing,
        sessionSnapshotId: snapshotId,
        recommendationReason:
            recommendationReason ?? existing.recommendationReason,
        isAutoplay: isAutoplay ?? existing.isAutoplay,
        requestedById: requestedById ?? existing.requestedById,
    })
}

/**
 * Persists the live queue state per guild (one snapshot each) in Postgres, so a
 * session can be restored after a bot restart. A snapshot is overwritten on each
 * save and deleted after a successful restore. Two independent staleness bounds
 * apply: `ttlSeconds` (storage TTL, lazy-expired on read) and `maxSnapshotAgeMs`
 * (the stricter restore guard — older snapshots are not auto-restored).
 */
// How long a restore waits for another restore of the same guild to finish.
// Well above a normal restore (a few searches plus play()), well below "stuck".
const RESTORE_WAIT_TIMEOUT_MS = 30_000

const EMPTY_RESTORE_RESULT: SnapshotRestoreResult = {
    restoredCount: 0,
    sessionSnapshotId: null,
    skippedYoutubeCount: 0,
}

type RestoreOptions = {
    maxAgeMs?: number
    skipCurrentTrack?: boolean
    // Keep queued autoplay picks. Only for an in-process recovery, where
    // the picks came from the running build and are still current.
    keepAutoplay?: boolean
    signal?: AbortSignal
}

export class MusicSessionSnapshotService {
    constructor(
        private readonly ttlSeconds = ENVIRONMENT_CONFIG.SESSIONS
            .QUEUE_SESSION_TTL,
        private readonly maxSnapshotAgeMs = DEFAULT_MAX_SNAPSHOT_AGE_MS,
    ) {}

    /** Maps a `music_session_snapshots` row to the public snapshot shape. */
    private rowToSnapshot(row: SnapshotRow): QueueSessionSnapshot {
        return {
            sessionSnapshotId: row.sessionSnapshotId,
            guildId: row.guildId,
            savedAt: row.savedAt.getTime(),
            currentTrack: (row.currentTrack ?? null) as SnapshotTrack | null,
            upcomingTracks: (row.upcomingTracks ?? []) as SnapshotTrack[],
            voiceChannelId: row.voiceChannelId ?? undefined,
        }
    }

    async saveSnapshot(
        queue: GuildQueue,
    ): Promise<QueueSessionSnapshot | null> {
        try {
            const guildId = queue.guild.id
            const currentTrack = queue.currentTrack
            const upcomingTracks = queue.tracks
                .toArray()
                .slice(0, MAX_SNAPSHOT_TRACKS)
                .map((track) => toSnapshotTrack(track as Track))

            if (!currentTrack && upcomingTracks.length === 0) {
                return null
            }

            const currentSnapshot = currentTrack
                ? {
                      ...toSnapshotTrack(currentTrack as Track),
                      ...playbackState(queue, currentTrack as Track),
                  }
                : null
            const sessionSnapshotId = randomUUID()
            const prisma = getPrismaClient()

            // One snapshot per guild, written atomically. A delete + create pair
            // raced when two saves for the same guild interleaved (both deleted,
            // then the second create hit the unique guildId constraint, P2002).
            // upsert is a single statement (INSERT .. ON CONFLICT DO UPDATE), so
            // concurrent saves converge on the last writer. A cleared
            // currentTrack must be written as DbNull: Prisma rejects a plain null
            // for a Json? column, and omitting the key would keep the stale track.
            const data = {
                sessionSnapshotId,
                voiceChannelId: queue.channel?.id ?? null,
                upcomingTracks:
                    upcomingTracks as unknown as Prisma.InputJsonValue,
                currentTrack: currentSnapshot
                    ? (currentSnapshot as unknown as Prisma.InputJsonValue)
                    : getDbNull(),
                savedAt: new Date(),
            }
            await prisma.musicSessionSnapshot.upsert({
                where: { guildId },
                create: { guildId, ...data },
                update: data,
            })

            return {
                sessionSnapshotId,
                guildId,
                savedAt: Date.now(),
                currentTrack: currentSnapshot,
                upcomingTracks,
                voiceChannelId: queue.channel?.id,
            }
        } catch (error) {
            errorLog({
                message: 'Failed to save music session snapshot',
                error,
                data: prismaErrorMeta(error),
            })
            return null
        }
    }

    private autosaveTimer: ReturnType<typeof setInterval> | null = null
    // A tick that finds the previous one still saving is skipped, so a slow
    // older upsert can never land after a newer position.
    private autosaveInFlight = false

    /**
     * Re-saves every playing or paused queue on an interval, so the stored
     * position is at most one interval old when the process dies without a
     * clean shutdown (#3151). The shutdown path saves once more on its own.
     * Idempotent.
     */
    startAutosave(
        listQueues: () => Iterable<GuildQueue>,
        intervalMs = SNAPSHOT_AUTOSAVE_INTERVAL_MS,
    ): void {
        if (this.autosaveTimer) return
        this.autosaveTimer = setInterval(() => {
            void this.autosaveTick(listQueues)
        }, intervalMs)
        this.autosaveTimer.unref?.()
    }

    stopAutosave(): void {
        if (!this.autosaveTimer) return
        clearInterval(this.autosaveTimer)
        this.autosaveTimer = null
    }

    private async autosaveTick(
        listQueues: () => Iterable<GuildQueue>,
    ): Promise<void> {
        if (this.autosaveInFlight) return
        let active: GuildQueue[]
        try {
            active = Array.from(listQueues()).filter(
                (queue) =>
                    queue.currentTrack &&
                    (queue.node.isPlaying() || queue.node.isPaused()),
            )
        } catch (error) {
            errorLog({
                message: 'Snapshot autosave failed to list queues',
                error,
            })
            return
        }
        this.autosaveInFlight = true
        try {
            // saveSnapshot logs and swallows its own errors.
            await Promise.all(active.map((queue) => this.saveSnapshot(queue)))
        } finally {
            this.autosaveInFlight = false
        }
    }

    /**
     * Clears the snapshot for a guild when only the current track exists.
     * Used to prevent watchdog from re-enqueuing the same song on orphan recovery.
     */
    async clearSnapshotIfStale(queue: GuildQueue): Promise<void> {
        if (!queue.currentTrack || queue.tracks.size > 0) {
            return
        }

        const snapshot = await this.getSnapshot(queue.guild.id)
        if (!snapshot || snapshot.upcomingTracks.length > 0) {
            return
        }

        await this.deleteSnapshot(queue.guild.id)
        debugLog({
            message: 'Cleared stale snapshot (only current track)',
            data: { guildId: queue.guild.id },
        })
    }

    async getSnapshot(guildId: string): Promise<QueueSessionSnapshot | null> {
        try {
            const prisma = getPrismaClient()
            const row = await prisma.musicSessionSnapshot.findUnique({
                where: { guildId },
            })
            if (!row) return null

            // Lazy storage-TTL expiry: prune snapshots older than ttlSeconds.
            if (row.savedAt.getTime() < Date.now() - this.ttlSeconds * 1000) {
                await this.deleteSnapshot(guildId)
                return null
            }

            return this.rowToSnapshot(row)
        } catch (error) {
            errorLog({
                message: 'Failed to read music session snapshot',
                error,
            })
            return null
        }
    }

    /**
     * Lists guild IDs that currently have a non-expired snapshot. Replaces the
     * watchdog's old Redis `keys('music:session:*')` scan now that snapshots live
     * in Postgres. Filters by the storage TTL so callers don't act on stale rows.
     */
    async listGuildIds(): Promise<string[]> {
        try {
            const prisma = getPrismaClient()
            const cutoff = new Date(Date.now() - this.ttlSeconds * 1000)
            const rows = await prisma.musicSessionSnapshot.findMany({
                where: { savedAt: { gte: cutoff } },
                select: { guildId: true },
            })
            return rows.map((r) => r.guildId)
        } catch (error) {
            errorLog({
                message: 'Failed to list music session snapshot guilds',
                error,
            })
            return []
        }
    }

    /**
     * Delete the snapshot for a guild.
     * Called after a successful restore so the same snapshot is not re-applied
     * on subsequent connections.
     */
    async deleteSnapshot(guildId: string): Promise<void> {
        try {
            const prisma = getPrismaClient()
            await prisma.musicSessionSnapshot.deleteMany({ where: { guildId } })
        } catch (error) {
            errorLog({
                message: 'Failed to delete music session snapshot',
                error,
            })
        }
    }

    // One restore per guild at a time. The startup sweep's queue.connect()
    // fires the connection handler's own restore on the same queue; both
    // passed the empty-queue guard before either added a track, so every song
    // was queued twice and play() ran twice (prod 2026-11-13). A caller that
    // finds a restore in flight waits for it, then re-runs the guard.
    private readonly restoresInFlight = new Map<
        string,
        { done: Promise<unknown> }
    >()

    async restoreSnapshot(
        queue: GuildQueue,
        requestedBy?: User,
        options: RestoreOptions = {},
    ): Promise<SnapshotRestoreResult> {
        const guildId = queue.guild.id
        let inFlight = this.restoresInFlight.get(guildId)
        while (inFlight) {
            const outcome = await this.waitForRestore(
                guildId,
                inFlight,
                options.signal,
            )
            if (outcome === 'aborted') return EMPTY_RESTORE_RESULT
            if (outcome === 'timedOut') break
            inFlight = this.restoresInFlight.get(guildId)
        }
        // No await between the map check above and this set, so two callers
        // cannot both see the guild free and both claim it.
        const entry = {
            done: this.restoreSnapshotOnce(queue, requestedBy, options),
        }
        this.restoresInFlight.set(guildId, entry)
        try {
            return await entry.done
        } finally {
            if (this.restoresInFlight.get(guildId) === entry) {
                this.restoresInFlight.delete(guildId)
            }
        }
    }

    // Waits for one in-flight restore to settle. Bounded: aborting a restore
    // does not cancel a search or play() that never settles, so an unbounded
    // wait could stall the startup sweep forever. On timeout the caller goes
    // ahead; the empty-queue guard still stops a duplicate when the stuck
    // restore already queued tracks.
    private async waitForRestore(
        guildId: string,
        inFlight: { done: Promise<unknown> },
        signal?: AbortSignal,
    ): Promise<'done' | 'aborted' | 'timedOut'> {
        if (signal?.aborted) return 'aborted'
        let timer: ReturnType<typeof setTimeout> | undefined
        let onAbort: (() => void) | undefined
        const outcome = await Promise.race([
            inFlight.done.then(
                () => 'done' as const,
                () => 'done' as const,
            ),
            new Promise<'timedOut'>((resolve) => {
                timer = setTimeout(
                    () => resolve('timedOut'),
                    RESTORE_WAIT_TIMEOUT_MS,
                )
            }),
            new Promise<'aborted'>((resolve) => {
                onAbort = () => resolve('aborted')
                signal?.addEventListener('abort', onAbort, { once: true })
            }),
        ])
        clearTimeout(timer)
        if (onAbort) signal?.removeEventListener('abort', onAbort)
        if (outcome === 'timedOut') {
            warnLog({
                message:
                    'Session restore still in flight after wait limit; restoring anyway',
                data: { guildId, waitMs: RESTORE_WAIT_TIMEOUT_MS },
            })
        }
        return outcome
    }

    private async restoreSnapshotOnce(
        queue: GuildQueue,
        requestedBy: User | undefined,
        options: RestoreOptions,
    ): Promise<SnapshotRestoreResult> {
        try {
            if (queue.currentTrack || queue.tracks.size > 0) {
                return {
                    restoredCount: 0,
                    sessionSnapshotId: null,
                    skippedYoutubeCount: 0,
                }
            }

            const snapshot = await this.getSnapshot(queue.guild.id)
            if (!snapshot) {
                return {
                    restoredCount: 0,
                    sessionSnapshotId: null,
                    skippedYoutubeCount: 0,
                }
            }

            // Staleness guard: reject snapshots older than maxAgeMs.
            const maxAge = options.maxAgeMs ?? this.maxSnapshotAgeMs
            if (Date.now() - snapshot.savedAt > maxAge) {
                debugLog({
                    message:
                        'Music session snapshot is too old; skipping restore',
                    data: {
                        guildId: queue.guild.id,
                        savedAt: snapshot.savedAt,
                        ageMs: Date.now() - snapshot.savedAt,
                        maxAgeMs: maxAge,
                    },
                })
                return {
                    restoredCount: 0,
                    sessionSnapshotId: null,
                    skippedYoutubeCount: 0,
                }
            }

            const searchOptions: SearchOptions = {
                searchEngine: QueryType.AUTO,
                ...(requestedBy ? { requestedBy } : {}),
            }

            // Build ordered track list: currentTrack first, resumed from where it
            // was (#3151), or left out when it is nearly over, would already have
            // ended, or skipCurrentTrack is set (orphan session recovery).
            const currentPlan: CurrentTrackPlan =
                snapshot.currentTrack && !options.skipCurrentTrack
                    ? planCurrentTrack(
                          snapshot.currentTrack,
                          snapshot.savedAt,
                          Date.now(),
                      )
                    : { restore: false }
            if (snapshot.currentTrack && !currentPlan.restore) {
                debugLog({
                    message:
                        'Snapshot current track is over or nearly over; not replaying it',
                    data: {
                        guildId: queue.guild.id,
                        title: snapshot.currentTrack.title,
                        positionMs: snapshot.currentTrack.positionMs,
                        skipCurrentTrack: options.skipCurrentTrack ?? false,
                    },
                })
            }
            const currentEntry =
                currentPlan.restore && snapshot.currentTrack
                    ? snapshot.currentTrack
                    : null
            const tracksToRestore: SnapshotTrack[] = [
                ...(currentEntry ? [currentEntry] : []),
                // After a restart, queued autoplay picks are dropped: the
                // recommender that chose them ran before it (often an older
                // build), and autoplay refills the queue from the restored
                // track anyway. Replaying them looked like random songs.
                ...snapshot.upcomingTracks.filter(
                    (t) => options.keepAutoplay || !t.isAutoplay,
                ),
            ]

            let restoredCount = 0
            let skippedYoutubeCount = 0
            // Seek only when the first track queued is the snapshot's current
            // one: if it failed to resolve, the next track starts from the top.
            let resumeSeekMs = 0
            // Same condition: a track paused before the restart comes back paused.
            let resumePaused = false
            // Tracks THIS restore added, so an abort can undo exactly those — never
            // tracks a user may have queued during the (racing) restore window.
            const restoredTracks: Track[] = []
            const undoRestoredTracks = () => {
                for (const t of restoredTracks) {
                    try {
                        queue.node.remove(t)
                    } catch {
                        // best-effort: track may already have been consumed
                    }
                }
            }
            try {
                for (const entry of tracksToRestore) {
                    // Aborted (caller's restore deadline elapsed): undo what we added
                    // and bail, so we never leave a partial restore after the caller
                    // moved on with an empty queue.
                    if (options.signal?.aborted) {
                        undoRestoredTracks()
                        return {
                            restoredCount: 0,
                            sessionSnapshotId: null,
                            skippedYoutubeCount: 0,
                        }
                    }
                    // HOSTED_YOUTUBE_ENABLED (decisions/2026-09-27-music-first-positioning.md
                    // point 3): no YouTube extractor is registered, so AUTO is a
                    // guaranteed miss for a youtube.com/youtu.be entry. Skip the
                    // search and count it instead of silently dropping it (#2486).
                    if (
                        !isHostedYoutubeEnabled() &&
                        isHost(entry.url, 'youtube.com', 'youtu.be')
                    ) {
                        skippedYoutubeCount += 1
                        continue
                    }
                    const query =
                        entry.url || `${entry.title} ${entry.author}`.trim()
                    const result = await queue.player.search(query, {
                        ...searchOptions,
                        ...textSearchBlockOptions(query),
                    })
                    // Re-check after the await — the deadline may have elapsed during
                    // the search, so don't enqueue this track post-abort.
                    if (options.signal?.aborted) {
                        undoRestoredTracks()
                        return {
                            restoredCount: 0,
                            sessionSnapshotId: null,
                            skippedYoutubeCount: 0,
                        }
                    }
                    const track = result.tracks[0]
                    if (!track) continue

                    applySnapshotMetadata(
                        track as Track,
                        snapshot.sessionSnapshotId,
                        entry.recommendationReason,
                        entry.isAutoplay,
                        entry.requestedById,
                    )
                    queue.addTrack(track)
                    if (
                        restoredCount === 0 &&
                        entry === currentEntry &&
                        currentPlan.restore
                    ) {
                        resumeSeekMs = currentPlan.seekMs
                        resumePaused = entry.paused === true
                    }
                    restoredTracks.push(track as Track)
                    restoredCount += 1
                }
            } catch (loopError) {
                // Rollback: clear partial queue state on any search/add failure
                queue.clear()
                errorLog({
                    message:
                        'Failed to restore track during restore loop; rolling back queue',
                    error: loopError,
                })
                return {
                    restoredCount: 0,
                    sessionSnapshotId: null,
                    skippedYoutubeCount: 0,
                }
            }

            if (
                tracksToRestore.length === 0 &&
                snapshot.currentTrack &&
                !options.skipCurrentTrack
            ) {
                // The only track was dropped as over: consume the snapshot, or
                // every later connection would read and drop it again.
                await this.deleteSnapshot(queue.guild.id)
            }

            if (restoredCount > 0) {
                // Do not delete the persisted snapshot until the restore can
                // no longer be cancelled — that point is play() actually
                // being invoked (or the queue already playing), not
                // deleteSnapshot() returning. Deleting first and checking
                // this signal afterward meant a stop landing during
                // deleteSnapshot()'s own async work still destroyed the only
                // persisted copy of a session that never actually resumed:
                // undoRestoredTracks() cannot bring back a row that is
                // already gone from the database.
                if (options.signal?.aborted) {
                    undoRestoredTracks()
                    return {
                        restoredCount: 0,
                        sessionSnapshotId: null,
                        skippedYoutubeCount: 0,
                    }
                }

                if (!queue.node.isPlaying()) {
                    if (resumeSeekMs > 0) {
                        await queue.node.play(undefined, { seek: resumeSeekMs })
                    } else {
                        await queue.node.play()
                    }
                    if (resumePaused) queue.node.pause()
                }

                // Clear the snapshot now that playback has committed (or was
                // already underway), so it cannot be applied again on the
                // next connection event.
                await this.deleteSnapshot(queue.guild.id)
            }

            if (skippedYoutubeCount > 0) {
                infoLog({
                    message:
                        'Music session snapshot restore skipped YouTube-only tracks (HOSTED_YOUTUBE_ENABLED=false)',
                    data: {
                        guildId: queue.guild.id,
                        skippedYoutubeCount,
                    },
                })
            }

            debugLog({
                message: 'Music session snapshot restored',
                data: {
                    guildId: queue.guild.id,
                    restoredCount,
                    sessionSnapshotId: snapshot.sessionSnapshotId,
                },
            })

            return {
                restoredCount,
                sessionSnapshotId:
                    restoredCount > 0 ? snapshot.sessionSnapshotId : null,
                skippedYoutubeCount,
            }
        } catch (error) {
            errorLog({
                message: 'Failed to restore music session snapshot',
                error,
            })
            return {
                restoredCount: 0,
                sessionSnapshotId: null,
                skippedYoutubeCount: 0,
            }
        }
    }
}

export const musicSessionSnapshotService = new MusicSessionSnapshotService()
