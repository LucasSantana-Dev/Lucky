export {
    isLastFmConfigured,
    getSessionKeyForUser,
    getTopTracks,
    isLastFmInvalidSessionError,
    normalizeLastFmArtist,
    normalizeLastFmTitle,
    updateNowPlaying,
    scrobble,
} from './lastFmApi'
export type { LastFmTopTrack, LastFmPeriod } from './lastFmApi'
