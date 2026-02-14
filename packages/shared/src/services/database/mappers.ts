import type {
    DatabaseUser,
    DatabaseGuild,
    DatabaseTrackHistory,
    DatabaseCommandUsage,
} from './types'
import type {
    UserModel,
    GuildModel,
    TrackHistoryModel,
    CommandUsageModel,
} from './models'

export function toUser(user: UserModel): DatabaseUser {
    return {
        id: String(user.id),
        discordId: String(user.discordId),
        username: String(user.username),
        avatar: user.avatar ? String(user.avatar) : undefined,
        createdAt:
            user.createdAt instanceof Date
                ? user.createdAt
                : new Date(user.createdAt),
        updatedAt:
            user.updatedAt instanceof Date
                ? user.updatedAt
                : new Date(user.updatedAt),
    }
}

export function toGuild(guild: GuildModel): DatabaseGuild {
    return {
        id: String(guild.id),
        discordId: String(guild.discordId),
        name: String(guild.name),
        icon: guild.icon ? String(guild.icon) : undefined,
        ownerId: String(guild.ownerId),
        createdAt:
            guild.createdAt instanceof Date
                ? guild.createdAt
                : new Date(guild.createdAt),
        updatedAt:
            guild.updatedAt instanceof Date
                ? guild.updatedAt
                : new Date(guild.updatedAt),
    }
}

export function toTrackHistory(track: TrackHistoryModel): DatabaseTrackHistory {
    return {
        id: String(track.id),
        guildId: String(track.guildId),
        trackId: String(track.trackId),
        title: String(track.title),
        author: String(track.author),
        duration: String(track.duration),
        url: String(track.url),
        thumbnail: track.thumbnail,
        source: String(track.source),
        playedAt:
            track.playedAt instanceof Date
                ? track.playedAt
                : new Date(track.playedAt),
        createdAt:
            track.createdAt instanceof Date
                ? track.createdAt
                : new Date(track.createdAt),
        playedBy: track.playedBy ? String(track.playedBy) : null,
        isAutoplay: Boolean(track.isAutoplay),
        playlistName: track.playlistName,
        playDuration: track.playDuration ? Number(track.playDuration) : null,
        skipped: track.skipped !== null ? Boolean(track.skipped) : null,
        isPlaylist:
            track.isPlaylist !== null ? Boolean(track.isPlaylist) : null,
    }
}

export function toCommandUsage(usage: CommandUsageModel): DatabaseCommandUsage {
    return {
        id: String(usage.id),
        userId: usage.userId ? String(usage.userId) : null,
        guildId: usage.guildId ? String(usage.guildId) : null,
        command: String(usage.command),
        category: String(usage.category),
        success: Boolean(usage.success),
        errorCode: usage.errorCode ? String(usage.errorCode) : null,
        duration: usage.duration ? Number(usage.duration) : null,
        createdAt:
            usage.createdAt instanceof Date
                ? usage.createdAt
                : new Date(usage.createdAt),
    }
}

export const EMPTY_USER: DatabaseUser = {
    id: '',
    discordId: '',
    username: '',
    avatar: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
}

export const EMPTY_GUILD: DatabaseGuild = {
    id: '',
    discordId: '',
    name: '',
    icon: undefined,
    ownerId: '',
    createdAt: new Date(),
    updatedAt: new Date(),
}

export const EMPTY_TRACK_HISTORY: DatabaseTrackHistory = {
    id: '',
    guildId: '',
    trackId: '',
    title: '',
    author: '',
    duration: '',
    url: '',
    thumbnail: null,
    source: '',
    playedAt: new Date(),
    createdAt: new Date(),
    playedBy: null,
    isAutoplay: false,
    playlistName: null,
    playDuration: null,
    skipped: false,
    isPlaylist: false,
}

export const EMPTY_COMMAND_USAGE: DatabaseCommandUsage = {
    id: '',
    userId: null,
    guildId: null,
    command: '',
    category: '',
    success: false,
    errorCode: null,
    duration: null,
    createdAt: new Date(),
}
