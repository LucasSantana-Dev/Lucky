import { COLOR } from '@lucky/shared/constants'

/** What the bot just did. Each action gets its own color and emoji so two
 * replies in a row never look alike, whatever platform the track came from. */
export type MusicAction =
    | 'nowPlaying'
    | 'queued'
    | 'playlistQueued'
    | 'skipped'
    | 'jumped'
    | 'paused'
    | 'resumed'
    | 'previous'
    | 'replayed'
    | 'seeked'
    | 'recommended'
    | 'history'

export const MUSIC_ACTION_STYLE: Record<
    MusicAction,
    { color: number; emoji: string }
> = {
    nowPlaying: { color: COLOR.LUCKY_PURPLE, emoji: '▶️' },
    queued: { color: COLOR.DISCORD_BLURPLE, emoji: '➕' },
    playlistQueued: { color: COLOR.DISCORD_BLURPLE, emoji: '📃' },
    skipped: { color: COLOR.WARNING_GOLD, emoji: '⏭️' },
    jumped: { color: COLOR.FFMPEG_ORANGE, emoji: '🎯' },
    paused: { color: COLOR.NEUTRAL_GRAY, emoji: '⏸️' },
    resumed: { color: COLOR.ENABLED_GREEN, emoji: '▶️' },
    previous: { color: COLOR.TIDAL_BLUE, emoji: '⏮️' },
    replayed: { color: COLOR.TIDAL_BLUE, emoji: '🔄' },
    seeked: { color: COLOR.TIDAL_BLUE, emoji: '⏩' },
    recommended: { color: COLOR.SETUP_PURPLE, emoji: '✨' },
    history: { color: COLOR.NEUTRAL_GRAY, emoji: '🕘' },
}
