// Dependency-free (type imports only) so error mapping and specs can load it
// without the shared logger and its Prisma client.
import type { GuildQueue, SearchResult, Track } from 'discord-player'

// ASMR is blocked on every server: /play refuses it with a message, and any
// ASMR track that reaches a queue another way (album, artist, playlist,
// dashboard) is removed as it is added. No word boundary, so channel names
// glued to it ("GibiASMR") match too.
const ASMR_RE = /asmr/i

export class AsmrBlockedError extends Error {
    constructor() {
        super("ASMR isn't allowed on this bot. Pick a song instead.")
        this.name = 'AsmrBlockedError'
    }
}

export function isAsmrTrack(track: {
    title?: string | null
    author?: string | null
}): boolean {
    return ASMR_RE.test(track.title ?? '') || ASMR_RE.test(track.author ?? '')
}

/**
 * Throws AsmrBlockedError for a text search that asks for ASMR, or a single
 * track result that is ASMR. A playlist passes: dropAsmrTracks removes its
 * ASMR tracks as they are queued.
 */
export function assertNotAsmr(query: string, result: SearchResult): void {
    const isUrl = /^https?:\/\//i.test(query.trim())
    if (!isUrl && ASMR_RE.test(query)) throw new AsmrBlockedError()
    if (result.hasPlaylist()) return
    const top = result.tracks[0]
    if (top && isAsmrTrack(top)) throw new AsmrBlockedError()
}

/** Removes the ASMR tracks among `tracks` from the queue and returns them. */
export function dropAsmrTracks(queue: GuildQueue, tracks: Track[]): Track[] {
    const dropped = tracks.filter((track) => isAsmrTrack(track))
    for (const track of dropped) queue.removeTrack(track)
    return dropped
}
