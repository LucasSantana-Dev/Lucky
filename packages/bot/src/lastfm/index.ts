export {
    isLastFmConfigured,
    getSessionKeyForUser,
    getTopTracks,
    getRecentTracks,
    getSimilarTracks,
    isLastFmInvalidSessionError,
    normalizeLastFmArtist,
    normalizeLastFmTitle,
    updateNowPlaying,
    scrobble,
} from './lastFmApi'
export type { LastFmTopTrack, LastFmPeriod } from './lastFmApi'
export { consumeLastFmSeedSlice } from '../utils/music/autoplay/lastFmSeeds'
