export function isSpotifyConfigured(): boolean {
    return !!(
        process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    )
}
