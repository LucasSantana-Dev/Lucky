import type { Track } from 'discord-player'
import { infoLog } from '@lucky/shared/utils'
import type { ScoredTrack } from './candidateCollector'
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
        const record: AutoplayAuditRecord = {
            cycleId: `${guildId}-${now}`,
            guildId,
            timestamp: now,
            seed,
            sessionMoodSummary: sessionMood?.dominantLocale ?? null,
            evaluated: this.evaluated,
            selected: this.selected,
            sourceCounts,
            durationMs,
        }
        infoLog({ message: 'Autoplay audit', data: record })
    }
}
