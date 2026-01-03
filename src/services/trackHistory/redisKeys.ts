export class TrackHistoryKeys {
    static getHistoryKey(guildId: string): string {
        return `track_history:${guildId}`
    }

    static getTrackIdsKey(guildId: string): string {
        return `track_ids:${guildId}`
    }

    static getLastTrackKey(guildId: string): string {
        return `last_track:${guildId}`
    }

    static getMetadataKey(trackId: string): string {
        return `track_metadata:${trackId}`
    }

    static getTrackMetadataKey(trackId: string): string {
        return `track_metadata:${trackId}`
    }

    static getStatsKey(guildId: string): string {
        return `track_stats:${guildId}`
    }

    static getDuplicateKey(guildId: string, trackUrl: string): string {
        return `duplicate_check:${guildId}:${trackUrl}`
    }
}
