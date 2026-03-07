# Discord Player Integration Guide

Comprehensive guide for using Discord Player in Nexus for music playback, queue management, and audio streaming.

## Table of Contents

- [Setup & Configuration](#setup--configuration)
- [Playing Music](#playing-music)
- [Queue Management](#queue-management)
- [Event Handling](#event-handling)
- [Extractors](#extractors)
- [Audio Filters](#audio-filters)
- [Error Handling](#error-handling)
- [Advanced Features](#advanced-features)

---

## Setup & Configuration

### Basic Setup

```typescript
import { Player } from 'discord-player'
import { Client } from 'discord.js'

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
})

const player = new Player(client)

// Load default extractors (YouTube, Spotify, etc.)
await player.extractors.loadDefault()

client.login(process.env.DISCORD_TOKEN)
```

### Advanced Configuration

```typescript
const player = new Player(client, {
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
    },
    skipFFmpeg: false,
    connectionTimeout: 30000,
})
```

### Custom FFmpeg Arguments

```typescript
const queue = player.nodes.create(guild, {
    metadata: {
        channel: interaction.channel,
    },
    ffmpegArgs: [
        '-af',
        'bass=g=10', // Bass boost
        '-ar',
        '48000',
        '-ac',
        '2',
    ],
})
```

---

## Playing Music

### Search and Play

```typescript
async function playMusic(
    interaction: ChatInputCommandInteraction,
    query: string,
) {
    const member = interaction.member as GuildMember
    const voiceChannel = member.voice.channel

    if (!voiceChannel) {
        return interaction.reply('You need to be in a voice channel!')
    }

    await interaction.deferReply()

    // Search for the track
    const result = await player.search(query, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO,
    })

    if (!result.hasTracks()) {
        return interaction.editReply('No results found!')
    }

    // Create or get queue
    const queue = player.nodes.create(interaction.guild, {
        metadata: {
            channel: interaction.channel,
        },
    })

    // Connect to voice channel
    if (!queue.connection) {
        await queue.connect(voiceChannel)
    }

    // Add track(s) to queue
    if (result.playlist) {
        queue.addTrack(result.tracks)
        await interaction.editReply(`Added playlist: ${result.playlist.title}`)
    } else {
        queue.addTrack(result.tracks[0])
        await interaction.editReply(`Added: ${result.tracks[0].title}`)
    }

    // Start playing if not already playing
    if (!queue.isPlaying()) {
        await queue.node.play()
    }
}
```

### Play from URL

```typescript
const result = await player.search('https://youtube.com/watch?v=...', {
    requestedBy: interaction.user,
})
```

### Play Playlist

```typescript
const result = await player.search('https://youtube.com/playlist?list=...', {
    requestedBy: interaction.user,
})

if (result.playlist) {
    queue.addTrack(result.tracks)
    await interaction.reply(
        `Added ${result.tracks.length} tracks from ${result.playlist.title}`,
    )
}
```

### Play Spotify

```typescript
const result = await player.search('https://open.spotify.com/track/...', {
    requestedBy: interaction.user,
    searchEngine: QueryType.SPOTIFY_SONG,
})
```

### Search Engines

```typescript
import { QueryType } from 'discord-player'

// Auto-detect
const result = await player.search(query, {
    searchEngine: QueryType.AUTO,
})

// YouTube
const result = await player.search(query, {
    searchEngine: QueryType.YOUTUBE,
})

// Spotify
const result = await player.search(query, {
    searchEngine: QueryType.SPOTIFY_SONG,
})

// SoundCloud
const result = await player.search(query, {
    searchEngine: QueryType.SOUNDCLOUD,
})
```

---

## Queue Management

### Get Queue

```typescript
const queue = player.nodes.get(interaction.guild.id)

if (!queue) {
    return interaction.reply('No music is playing!')
}
```

### Add Tracks

```typescript
// Add single track
queue.addTrack(track)

// Add multiple tracks
queue.addTrack([track1, track2, track3])

// Insert at specific position
queue.insertTrack(track, 0) // Insert at beginning
```

### Remove Tracks

```typescript
// Remove by index
queue.removeTrack(0)

// Remove multiple
queue.removeTrack([0, 1, 2])

// Clear queue
queue.clear()
```

### Skip Tracks

```typescript
// Skip current track
queue.node.skip()

// Skip to specific track
queue.node.skipTo(5)
```

### Shuffle Queue

```typescript
queue.tracks.shuffle()
```

### Repeat Modes

```typescript
import { QueueRepeatMode } from 'discord-player'

// Off (no repeat)
queue.setRepeatMode(QueueRepeatMode.OFF)

// Repeat current track
queue.setRepeatMode(QueueRepeatMode.TRACK)

// Repeat entire queue
queue.setRepeatMode(QueueRepeatMode.QUEUE)

// Autoplay (similar tracks)
queue.setRepeatMode(QueueRepeatMode.AUTOPLAY)
```

### Pause/Resume

```typescript
// Pause
queue.node.pause()

// Resume
queue.node.resume()

// Toggle
queue.node.setPaused(!queue.node.isPaused())
```

### Volume Control

```typescript
// Set volume (0-100)
queue.node.setVolume(50)

// Get current volume
const volume = queue.node.volume
```

### Seek

```typescript
// Seek to position (milliseconds)
queue.node.seek(60000) // Seek to 1 minute
```

### Get Current Track

```typescript
const currentTrack = queue.currentTrack

if (currentTrack) {
    console.log(`Now playing: ${currentTrack.title}`)
}
```

### Get Queue Tracks

```typescript
// All tracks in queue
const tracks = queue.tracks.data

// First 10 tracks
const firstTen = queue.tracks.data.slice(0, 10)

// Queue size
const size = queue.tracks.size
```

---

## Event Handling

### Player Events

```typescript
// Track starts playing
player.events.on('playerStart', (queue, track) => {
    const channel = queue.metadata.channel
    channel.send(`Now playing: ${track.title}`)
})

// Track finishes
player.events.on('playerFinish', (queue, track) => {
    console.log(`Finished playing: ${track.title}`)
})

// Queue ends
player.events.on('emptyQueue', (queue) => {
    const channel = queue.metadata.channel
    channel.send('Queue finished!')
})

// Channel becomes empty
player.events.on('emptyChannel', (queue) => {
    console.log('Everyone left the voice channel')
    queue.delete()
})

// Error occurred
player.events.on('error', (queue, error) => {
    console.error('Player error:', error)
    const channel = queue.metadata.channel
    channel.send('An error occurred!')
})

// Player error (track-specific)
player.events.on('playerError', (queue, error, track) => {
    console.error(`Error playing ${track.title}:`, error)
})

// Audio track added
player.events.on('audioTrackAdd', (queue, track) => {
    console.log(`Added: ${track.title}`)
})

// Audio tracks added
player.events.on('audioTracksAdd', (queue, tracks) => {
    console.log(`Added ${tracks.length} tracks`)
})

// Connection created
player.events.on('connection', (queue) => {
    console.log('Connected to voice channel')
})

// Connection destroyed
player.events.on('disconnect', (queue) => {
    console.log('Disconnected from voice channel')
})

// Debug information
player.events.on('debug', (queue, message) => {
    console.log(`[DEBUG] ${message}`)
})
```

### Event Metadata

```typescript
// Store channel in metadata
const queue = player.nodes.create(guild, {
    metadata: {
        channel: interaction.channel,
        requestedBy: interaction.user,
    },
})

// Access in events
player.events.on('playerStart', (queue, track) => {
    const { channel, requestedBy } = queue.metadata
    channel.send(
        `Now playing: ${track.title} (requested by ${requestedBy.tag})`,
    )
})
```

---

## Extractors

### Load Default Extractors

```typescript
// Load all default extractors
await player.extractors.loadDefault()

// Load specific extractors
await player.extractors.loadDefault((ext) => ext !== 'YouTubeExtractor')
```

### Register Custom Extractor

```typescript
import { YouTubeExtractor } from 'discord-player-youtubei'

await player.extractors.register(YouTubeExtractor, {
    authentication: process.env.YOUTUBE_OAUTH_TOKEN,
    streamOptions: {
        useClient: 'ANDROID',
    },
})
```

### Available Extractors

- **YouTubeExtractor** - YouTube videos and playlists
- **SpotifyExtractor** - Spotify tracks, albums, playlists
- **SoundCloudExtractor** - SoundCloud tracks
- **AppleMusicExtractor** - Apple Music tracks
- **VimeoExtractor** - Vimeo videos
- **AttachmentExtractor** - Discord attachments
- **ReverbnationExtractor** - Reverbnation tracks

---

## Audio Filters

### Apply Filters

```typescript
// Bass boost
await queue.filters.ffmpeg.setFilters(['bassboost'])

// Nightcore
await queue.filters.ffmpeg.setFilters(['nightcore'])

// Vaporwave
await queue.filters.ffmpeg.setFilters(['vaporwave'])

// 8D Audio
await queue.filters.ffmpeg.setFilters(['8D'])

// Multiple filters
await queue.filters.ffmpeg.setFilters(['bassboost', 'normalizer'])
```

### Available Filters

```typescript
const filters = [
    'bassboost',
    'nightcore',
    'vaporwave',
    '8D',
    'normalizer',
    'surrounding',
    'pulsator',
    'tremolo',
    'vibrato',
    'reverse',
    'treble',
    'normalizer2',
    'surrounding2',
    'dim',
    'compressor',
    'expander',
    'softlimiter',
    'chorus',
    'chorus2d',
    'chorus3d',
    'fadein',
    'phaser',
    'tremolo2',
    'vibrato2',
    'subboost',
    'karaoke',
    'flanger',
    'gate',
    'haas',
    'mcompand',
    'mono',
    'mstlr',
    'mstrr',
    'silenceremove',
]
```

### Clear Filters

```typescript
await queue.filters.ffmpeg.setFilters([])
```

### Custom FFmpeg Filters

```typescript
await queue.filters.ffmpeg.setInputArgs(['-af', 'bass=g=10,volume=1.5'])
```

---

## Error Handling

### Try-Catch Pattern

```typescript
async function playMusic(
    interaction: ChatInputCommandInteraction,
    query: string,
) {
    try {
        await interaction.deferReply()

        const result = await player.search(query, {
            requestedBy: interaction.user,
        })

        if (!result.hasTracks()) {
            return interaction.editReply('No results found!')
        }

        const queue = player.nodes.create(interaction.guild, {
            metadata: { channel: interaction.channel },
        })

        await queue.connect(member.voice.channel)
        queue.addTrack(result.tracks[0])

        if (!queue.isPlaying()) {
            await queue.node.play()
        }

        await interaction.editReply(`Now playing: ${result.tracks[0].title}`)
    } catch (error) {
        console.error('Error playing music:', error)

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'

        await interaction.editReply({
            content: `Error: ${errorMessage}`,
        })
    }
}
```

### Handle Player Errors

```typescript
player.events.on('playerError', (queue, error, track) => {
    console.error(`Error playing ${track.title}:`, error)

    const channel = queue.metadata.channel
    channel.send(`Failed to play ${track.title}. Skipping...`)

    // Skip to next track
    queue.node.skip()
})

player.events.on('error', (queue, error) => {
    console.error('Queue error:', error)

    const channel = queue.metadata.channel
    channel.send('An error occurred with the music player!')
})
```

### Validation

```typescript
// Check if user is in voice channel
const member = interaction.member as GuildMember
if (!member.voice.channel) {
    return interaction.reply({
        content: 'You need to be in a voice channel!',
        ephemeral: true,
    })
}

// Check if bot can join
const permissions = member.voice.channel.permissionsFor(
    interaction.guild.members.me,
)
if (!permissions.has(PermissionFlagsBits.Connect)) {
    return interaction.reply({
        content: 'I cannot join your voice channel!',
        ephemeral: true,
    })
}

// Check if bot can speak
if (!permissions.has(PermissionFlagsBits.Speak)) {
    return interaction.reply({
        content: 'I cannot speak in your voice channel!',
        ephemeral: true,
    })
}
```

---

## Advanced Features

### Track History

```typescript
// Get previous tracks
const history = queue.history.tracks.data

// Get last played track
const lastTrack = queue.history.previousTrack

// Go back to previous track
await queue.history.previous()
```

### Autoplay

```typescript
// Enable autoplay (plays similar tracks when queue ends)
queue.setRepeatMode(QueueRepeatMode.AUTOPLAY)
```

### Track Metadata

```typescript
const track = queue.currentTrack

console.log({
    title: track.title,
    author: track.author,
    duration: track.duration,
    url: track.url,
    thumbnail: track.thumbnail,
    views: track.views,
    requestedBy: track.requestedBy,
    source: track.source,
    raw: track.raw, // Original data from extractor
})
```

### Queue Metadata

```typescript
// Store custom data
const queue = player.nodes.create(guild, {
    metadata: {
        channel: interaction.channel,
        requestedBy: interaction.user,
        guildId: guild.id,
        customData: { foo: 'bar' },
    },
})

// Access metadata
const metadata = queue.metadata
console.log(metadata.customData.foo) // 'bar'
```

### Progress Bar

```typescript
function createProgressBar(queue: GuildQueue): string {
    const track = queue.currentTrack
    const timestamp = queue.node.getTimestamp()

    const current = timestamp.current.value
    const total = track.durationMS

    const progress = Math.round((current / total) * 20)
    const emptyProgress = 20 - progress

    const progressBar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(emptyProgress)
    const currentTime = timestamp.current.label
    const totalTime = track.duration

    return `${progressBar} \`${currentTime} / ${totalTime}\``
}

// Usage
const progressBar = createProgressBar(queue)
await interaction.reply(progressBar)
```

### Live Streams

```typescript
// Check if track is live
if (track.raw.live) {
    console.log('This is a live stream')
}

// Live streams have duration "0:00"
if (track.duration === '0:00') {
    console.log('This is likely a live stream')
}
```

### Download Track

```typescript
import { createWriteStream } from 'fs'

const stream = await player.stream(track.url)
const writeStream = createWriteStream('output.mp3')

stream.stream.pipe(writeStream)

writeStream.on('finish', () => {
    console.log('Download complete!')
})
```

---

## Best Practices

### 1. Always Check Voice State

```typescript
const member = interaction.member as GuildMember
const voiceChannel = member.voice.channel

if (!voiceChannel) {
    return interaction.reply('You need to be in a voice channel!')
}

// Check if bot is in different channel
const queue = player.nodes.get(interaction.guild.id)
if (queue && queue.channel.id !== voiceChannel.id) {
    return interaction.reply('I am already playing in another channel!')
}
```

### 2. Use Deferred Replies

```typescript
// Search can take time
await interaction.deferReply()

const result = await player.search(query, {
    requestedBy: interaction.user,
})

await interaction.editReply('...')
```

### 3. Clean Up on Disconnect

```typescript
player.events.on('disconnect', (queue) => {
    console.log('Disconnected, cleaning up...')
    queue.delete()
})
```

### 4. Handle Empty Queue

```typescript
player.events.on('emptyQueue', (queue) => {
    const channel = queue.metadata.channel
    channel.send('Queue finished! Disconnecting...')

    setTimeout(() => {
        if (queue.connection) {
            queue.delete()
        }
    }, 60000) // Wait 1 minute before disconnecting
})
```

### 5. Limit Queue Size

```typescript
const MAX_QUEUE_SIZE = 100

if (queue.tracks.size >= MAX_QUEUE_SIZE) {
    return interaction.reply({
        content: `Queue is full! (max ${MAX_QUEUE_SIZE} tracks)`,
        ephemeral: true,
    })
}
```

---

## Troubleshooting

### Common Issues

**1. "No audio is playing"**

- Check FFmpeg is installed
- Verify voice permissions
- Check audio filters aren't causing issues

**2. "Cannot find module 'discord-player'"**

```bash
npm install discord-player
```

**3. "Extractor not found"**

```typescript
// Make sure to load extractors
await player.extractors.loadDefault()
```

**4. "Voice connection timeout"**

```typescript
// Increase timeout
const player = new Player(client, {
    connectionTimeout: 60000, // 60 seconds
})
```

**5. "High memory usage"**

```typescript
// Clear queue history periodically
queue.history.clear()
```

---

## Additional Resources

- [Discord Player Documentation](https://discord-player.js.org/)
- [Discord Player GitHub](https://github.com/Androz2091/discord-player)
- [Discord Player Examples](https://github.com/Androz2091/discord-player/tree/master/examples)
- [Library References](./LIBRARY_REFERENCES.md)
- [FFmpeg Usage Guide](./FFMPEG_USAGE.md)

---

**Last Updated:** February 2026
