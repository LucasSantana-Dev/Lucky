import type { Track } from 'discord-player'
import { infoLog } from '@lucky/shared/utils'
import type { ScoredTrack } from './diversitySelector'
import { serializeBasis } from './recommendationBasis.js'
import type { SessionMood } from './sessionMood'

interface EvaluatedCandidate {
    title: string
    artist: string
    score: number
    reason: string
    status: 'accepted' | 'rejected'
}

interface SelectedTrack {
    title: string
    artist: string
    score: number
    reason: string
}

/** Keeps one pass's single info log line bounded. */
const MAX_EVALUATED_ENTRIES = 50

export interface AutoplayAuditRecord {
    cycleId: string
    guildId: string
    timestamp: number
    seed: string
    sessionMoodSummary: string | null
    evaluated: EvaluatedCandidate[]
    selected: SelectedTrack[]
    sourceCounts: Record<string, number>
    durationMs: number
    /** Evaluated entries omitted from `evaluated` by the cap. */
    droppedCount: number
}

export class AutoplayAuditCollector {
    private evaluated: EvaluatedCandidate[] = []
    private selected: SelectedTrack[] = []

    recordEvaluated(
        track: Track,
        score: number,
        reason: string,
        status: 'accepted' | 'rejected',
    ): void {
        this.evaluated.push({
            title: track.title,
            artist: track.author,
            score,
            reason,
            status,
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
        sourceCounts: Record<string, number>,
        durationMs: number,
    ): void {
        const now = Date.now()
        const droppedCount = Math.max(
            0,
            this.evaluated.length - MAX_EVALUATED_ENTRIES,
        )
        // Only reorder when trimming, so short passes keep evaluation order.
        const evaluated =
            droppedCount > 0
                ? [...this.evaluated]
                      .sort((a, b) => b.score - a.score)
                      .slice(0, MAX_EVALUATED_ENTRIES)
                : this.evaluated
        const record: AutoplayAuditRecord = {
            cycleId: `${guildId}-${now}`,
            guildId,
            timestamp: now,
            seed,
            sessionMoodSummary: sessionMood?.dominantLocale ?? null,
            evaluated,
            selected: this.selected,
            sourceCounts,
            durationMs,
            droppedCount,
        }
        infoLog({ message: 'Autoplay audit', data: record })
    }
}
