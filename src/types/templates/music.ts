/**
 * Music-specific template literal types
 * Using existing types from discord-player and discord.js where possible
 */

export type { Track, GuildQueue, SearchResult, Player } from 'discord-player'
export type { User, GuildMember, VoiceChannel, TextChannel } from 'discord.js'

// Custom music-specific types that aren't available in the libraries
export type MusicSource =
    | 'youtube'
    | 'spotify'
    | 'soundcloud'
    | 'bandcamp'
    | 'local'

export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'aac' | 'ogg' | 'm4a'

export type QualityLevel = 'low' | 'medium' | 'high' | 'lossless'

export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'loading'

export type RepeatMode = 'off' | 'track' | 'queue'

export type ShuffleMode = 'off' | 'on'

export type VolumeLevel = `${number}%`

export type Duration = `${number}:${number}`

export type Bitrate = `${number}kbps`

export type SampleRate = `${number}Hz`

export type AudioCodec = 'mp3' | 'aac' | 'flac' | 'ogg' | 'wav'

export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1'

export type Resolution = `${number}x${number}`

export type FrameRate = `${number}fps`

export type AspectRatio = `${number}:${number}`

export type VideoQuality =
    | '144p'
    | '240p'
    | '360p'
    | '480p'
    | '720p'
    | '1080p'
    | '1440p'
    | '2160p'

export type AudioChannel = 'mono' | 'stereo' | '5.1' | '7.1'

export type AudioBitDepth = '8bit' | '16bit' | '24bit' | '32bit'

export type AudioSampleFormat =
    | 'int8'
    | 'int16'
    | 'int24'
    | 'int32'
    | 'float32'
    | 'float64'

export type AudioEndianness = 'little' | 'big'

export type AudioByteOrder = 'little-endian' | 'big-endian'

export type AudioEncoding = 'pcm' | 'adpcm' | 'g711' | 'g722' | 'g726' | 'g729'

export type AudioCompression = 'none' | 'lossy' | 'lossless'
