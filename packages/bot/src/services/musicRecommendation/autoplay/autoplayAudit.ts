import type { Track } from 'discord-player'
import { infoLog } from '@lucky/shared/utils'
import type { ScoredTrack } from './diversitySelector'
import { serializeBasis } from './recommendationBasis.js'
import type { VetoReason } from './recommendationBasis.js'
import type { SessionMood } from './sessionMood'

interface EvaluatedCandidate {
    title: string
    artist: string
    /**
     * A hard-reject is `-Infinity`, which JSON.stringify turns into `null`
     * (indistinguishable from "no score" in Loki), so non-finite scores are
     * logged as their string form, e.g. `"-Infinity"`.
     */
    score: number | string
    reason: string
    status: 'accepted' | 'rejected'
    /** Why the scorer vetoed the candidate; only on hard-rejects. */
    veto?: VetoReason
}

/** Internal form: keeps the raw number so the cap can sort on it. */
type RecordedCandidate = Omit<EvaluatedCandidate, 'score'> & { score: number }

interface SelectedTrack {
    title: string
    artist: string
    score: number
    reason: string
}

/** Keeps one pass's single info log line bounded. */
const MAX_EVALUATED_ENTRIES = 50

/**
 * A skipped source never ran; keep it distinct from "ran, found nothing".
 * `reason` says why it did not run (e.g. `no-guild-genres`).
 */
export type SourceCount = number | { skipped: true; reason?: string }

/** Rejects kept when the cap trims, so vetoes never vanish from the log. */
const MAX_REJECTED_ENTRIES = 10

/** Mirrors the fields `detectSessionMood` computes; none of them may be dropped. */
interface SessionMoodAudit {
    dominantLocale: SessionMood['dominantLocale']
    deepDiveArtist: string | null
    restless: boolean
    preferLong: boolean
    preferShort: boolean
    recentSkipCount: number
}

function summarizeMood(mood: SessionMood | null): SessionMoodAudit | null {
    if (!mood) return null
    return {
        dominantLocale: mood.dominantLocale,
        deepDiveArtist: mood.deepDiveArtist,
        restless: mood.restless,
        preferLong: mood.preferLong,
        preferShort: mood.preferShort,
        recentSkipCount: mood.recentSkipCount ?? 0,
    }
}

function serializeScore(score: number): number | string {
    return Number.isFinite(score) ? score : String(score)
}

export interface AutoplayAuditRecord {
    cycleId: string
    guildId: string
    timestamp: number
    seed: string
    sessionMood: SessionMoodAudit | null
    /** Genre families the scorer's cross-genre veto compared candidates against. */
    sessionGenreFamilies: string[]
    evaluated: EvaluatedCandidate[]
    selected: SelectedTrack[]
    sourceCounts: Record<string, SourceCount>
    durationMs: number
    /** Evaluated entries omitted from `evaluated` by the cap. */
    droppedCount: number
    /** All hard-rejects this pass, including ones the cap omitted. */
    rejectedCount: number
}

export class AutoplayAuditCollector {
    private evaluated: RecordedCandidate[] = []
    private selected: SelectedTrack[] = []

    recordEvaluated(
        track: Track,
        score: number,
        reason: string,
        status: 'accepted' | 'rejected',
        veto?: VetoReason,
    ): void {
        this.evaluated.push({
            title: track.title,
            artist: track.author,
            score,
            reason,
            status,
            ...(veto ? { veto } : {}),
        })
    }

    setFinalSelected(tracks: ScoredTrack[]): void {
        this.selected = tracks.map((t) => ({
            title: t.track.title,
            artist: t.track.author,
            score: t.score,
            reason: serializeBasis(t.basis),
        }))
    }

    emit(
        guildId: string,
        seed: string,
        sessionMood: SessionMood | null,
        sourceCounts: Record<string, SourceCount>,
        durationMs: number,
        sessionGenreFamilies: Iterable<string> = [],
    ): void {
        const now = Date.now()
        const rejectedCount = this.evaluated.filter(
            (e) => e.status === 'rejected',
        ).length
        const capped = this.capEvaluated(
            this.evaluated.length > MAX_EVALUATED_ENTRIES,
        )
        const droppedCount = this.evaluated.length - capped.length
        const record: AutoplayAuditRecord = {
            cycleId: `${guildId}-${now}`,
            guildId,
            timestamp: now,
            seed,
            sessionMood: summarizeMood(sessionMood),
            sessionGenreFamilies: Array.from(sessionGenreFamilies).sort(
                (a, b) => a.localeCompare(b),
            ),
            evaluated: capped.map((e) => ({
                ...e,
                score: serializeScore(e.score),
            })),
            selected: this.selected,
            sourceCounts,
            durationMs,
            droppedCount,
            rejectedCount,
        }
        infoLog({ message: 'Autoplay audit', data: record })
    }

    /**
     * Only reorders when trimming, so short passes keep evaluation order.
     * Hard-rejects sort last by score, so a plain score sort would drop every
     * veto first; reserve room for the first few instead.
     */
    private capEvaluated(trim: boolean): RecordedCandidate[] {
        if (!trim) return this.evaluated
        const rejected = this.evaluated.filter((e) => e.status === 'rejected')
        const keptRejected = rejected.slice(0, MAX_REJECTED_ENTRIES)
        const others = this.evaluated
            .filter((e) => e.status !== 'rejected')
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_EVALUATED_ENTRIES - keptRejected.length)
        return [...others, ...keptRejected]
    }
}
