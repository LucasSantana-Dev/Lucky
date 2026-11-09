// Dependency-free so playErrorMessage can match these without pulling in
// resolveProvider's import graph.

/**
 * A YouTube playlist link could not be loaded. There is no single title to
 * search for a whole playlist, so the user gets a clear "paste a song
 * instead" message (music.errors.youtubePlaylistUnavailable) instead of
 * "no results".
 */
export class YoutubePlaylistUnavailableError extends Error {
    constructor(options?: { cause?: unknown }) {
        super('YouTube playlists are not available right now', options)
        this.name = 'YoutubePlaylistUnavailableError'
    }
}

/**
 * A YouTube video link could not be played and its title could not be read
 * either, with no earlier error to report instead (the
 * HOSTED_YOUTUBE_ENABLED=false path never asks YouTube for the link).
 */
export class YoutubeVideoUnavailableError extends Error {
    constructor() {
        super('This YouTube link could not be played')
        this.name = 'YoutubeVideoUnavailableError'
    }
}
