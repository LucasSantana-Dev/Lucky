export const messages = {
    error: {
        guildOnly: '👥 This command can only be used in a server!',
        voiceChannel: '🔈 You need to be in a voice channel!',
        noQueue: "🤔 There's no music playing at the moment.",
        noTrack: 'No music is currently playing!',
        notPlaying: "🤔 There's no music playing at the moment.",
        volumeRange: '🔊 Volume must be between 1 and 100!',
        noQuery: '❌ You need to provide a search term or URL.',
        noResult: '❌ No results found.',
        generic: '❌ An error occurred while processing your request.',
        downloadFailed: '❌ Failed to download content.',
        invalidOption: '❌ Invalid option.',
        nonHandledError:
            '❌ An unhandled error occurred. Please try again later.',
    },
    success: {
        volumeSet: (value: number) => `🔊 Volume set to ${value}%`,
        currentVolume: (value: number) => `🔊 Volume is at ${value}%`,
    },
}
