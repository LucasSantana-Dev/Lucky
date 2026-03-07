# Code Examples

Collection of common code patterns and snippets used in Nexus. Copy-paste ready examples for quick development.

## Table of Contents

- [Discord Commands](#discord-commands)
- [Music Player](#music-player)
- [Database Operations](#database-operations)
- [Redis Caching](#redis-caching)
- [API Routes](#api-routes)
- [Error Handling](#error-handling)
- [Utilities](#utilities)

---

## Discord Commands

### Basic Slash Command

```typescript
// packages/bot/src/functions/example/commands/ping.ts
import { SlashCommandBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),

    async execute(interaction: ChatInputCommandInteraction) {
        const sent = await interaction.reply({
            content: 'Pinging...',
            fetchReply: true,
        })

        const latency = sent.createdTimestamp - interaction.createdTimestamp

        await interaction.editReply(
            `Pong! Latency: ${latency}ms | API: ${interaction.client.ws.ping}ms`,
        )
    },
}
```

### Command with Options and Validation

```typescript
// packages/bot/src/functions/music/commands/volume.ts
import { SlashCommandBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { player } from '../../../bot/start/initializer.js'

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set player volume')
        .addIntegerOption((option) =>
            option
                .setName('level')
                .setDescription('Volume level (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100),
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const member = interaction.member as GuildMember

        // Validate user is in voice channel
        if (!member.voice.channel) {
            return interaction.reply({
                content: '❌ You need to be in a voice channel!',
                ephemeral: true,
            })
        }

        // Get queue
        const queue = player.nodes.get(interaction.guild!.id)
        if (!queue) {
            return interaction.reply({
                content: '❌ No music is playing!',
                ephemeral: true,
            })
        }

        // Get and validate volume
        const volume = interaction.options.getInteger('level', true)

        // Set volume
        queue.node.setVolume(volume)

        await interaction.reply(`🔊 Volume set to ${volume}%`)
    },
}
```

### Command with Feature Toggle

```typescript
// packages/bot/src/functions/music/commands/play.ts
import { SlashCommandBuilder } from '@discordjs/builders'
import type { ChatInputCommandInteraction } from 'discord.js'
import { featureToggleService } from '@nexus/shared'

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Song name or URL')
                .setRequired(true),
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        // Check feature toggle
        const isEnabled = await featureToggleService.isEnabled(
            'MUSIC_PLAYBACK',
            {
                userId: interaction.user.id,
                guildId: interaction.guild!.id,
            },
        )

        if (!isEnabled) {
            return interaction.reply({
                content: '❌ Music playback is currently disabled!',
                ephemeral: true,
            })
        }

        // Command logic...
    },
}
```

---

## Music Player

### Play Music with Error Handling

```typescript
import { player } from '../../../bot/start/initializer.js'
import { QueryType } from 'discord-player'
import type { GuildMember } from 'discord.js'

async function playMusic(interaction: ChatInputCommandInteraction) {
    try {
        const member = interaction.member as GuildMember
        const query = interaction.options.getString('query', true)

        // Validate voice channel
        if (!member.voice.channel) {
            return interaction.reply({
                content: '❌ You need to be in a voice channel!',
                ephemeral: true,
            })
        }

        await interaction.deferReply()

        // Search for track
        const result = await player.search(query, {
            requestedBy: interaction.user,
            searchEngine: QueryType.AUTO,
        })

        if (!result.hasTracks()) {
            return interaction.editReply('❌ No results found!')
        }

        // Create or get queue
        const queue = player.nodes.create(interaction.guild!, {
            metadata: {
                channel: interaction.channel,
            },
        })

        // Connect to voice channel
        if (!queue.connection) {
            await queue.connect(member.voice.channel)
        }

        // Add track(s)
        if (result.playlist) {
            queue.addTrack(result.tracks)
            await interaction.editReply(
                `✅ Added playlist: **${result.playlist.title}** (${result.tracks.length} tracks)`,
            )
        } else {
            queue.addTrack(result.tracks[0])
            await interaction.editReply(
                `✅ Added: **${result.tracks[0].title}**`,
            )
        }

        // Start playing
        if (!queue.isPlaying()) {
            await queue.node.play()
        }
    } catch (error) {
        console.error('Error playing music:', error)

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'

        if (interaction.deferred) {
            await interaction.editReply(`❌ Error: ${errorMessage}`)
        } else {
            await interaction.reply({
                content: `❌ Error: ${errorMessage}`,
                ephemeral: true,
            })
        }
    }
}
```

### Now Playing Embed

```typescript
import { EmbedBuilder } from 'discord.js'

function createNowPlayingEmbed(queue: GuildQueue) {
    const track = queue.currentTrack
    const timestamp = queue.node.getTimestamp()

    const progress = Math.round(
        (timestamp.current.value / track.durationMS) * 20,
    )
    const progressBar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(20 - progress)

    const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
            { name: 'Artist', value: track.author, inline: true },
            { name: 'Duration', value: track.duration, inline: true },
            {
                name: 'Requested by',
                value: track.requestedBy!.tag,
                inline: true,
            },
            {
                name: 'Progress',
                value: `${progressBar}\n\`${timestamp.current.label} / ${track.duration}\``,
            },
        )
        .setColor('#5865F2')
        .setTimestamp()

    return embed
}
```

---

## Database Operations

### Create User with Preferences

```typescript
import { prisma } from '@nexus/shared'

async function createUser(discordId: string, username: string) {
    const user = await prisma.user.create({
        data: {
            discordId,
            username,
            preferences: {
                create: {
                    preferredVolume: 50,
                    autoPlayEnabled: true,
                    embedColor: '#5865F2',
                },
            },
        },
        include: {
            preferences: true,
        },
    })

    return user
}
```

### Find or Create Pattern

```typescript
async function findOrCreateGuild(discordId: string, name: string) {
    let guild = await prisma.guild.findUnique({
        where: { discordId },
        include: { settings: true },
    })

    if (!guild) {
        guild = await prisma.guild.create({
            data: {
                discordId,
                name,
                ownerId: 'unknown',
                settings: {
                    create: {
                        defaultVolume: 50,
                        maxQueueSize: 100,
                        autoPlayEnabled: true,
                    },
                },
            },
            include: { settings: true },
        })
    }

    return guild
}
```

### Update with Transaction

```typescript
async function updateUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>,
) {
    return await prisma.$transaction(async (tx) => {
        // Get user
        const user = await tx.user.findUnique({
            where: { id: userId },
        })

        if (!user) {
            throw new Error('User not found')
        }

        // Update preferences
        const updated = await tx.userPreferences.update({
            where: { userId },
            data: preferences,
        })

        return updated
    })
}
```

### Query with Relations

```typescript
async function getGuildWithHistory(guildId: string) {
    const guild = await prisma.guild.findUnique({
        where: { discordId: guildId },
        include: {
            settings: true,
            trackHistory: {
                take: 10,
                orderBy: { playedAt: 'desc' },
            },
            twitchNotifications: true,
        },
    })

    return guild
}
```

### Pagination

```typescript
async function getTrackHistory(
    guildId: string,
    page: number = 1,
    pageSize: number = 20,
) {
    const skip = (page - 1) * pageSize

    const [tracks, total] = await Promise.all([
        prisma.trackHistory.findMany({
            where: { guild: { discordId: guildId } },
            skip,
            take: pageSize,
            orderBy: { playedAt: 'desc' },
        }),
        prisma.trackHistory.count({
            where: { guild: { discordId: guildId } },
        }),
    ])

    return {
        tracks,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    }
}
```

---

## Redis Caching

### Basic Get/Set

```typescript
import { redis } from '@nexus/shared'

// Set with expiration
await redis.setex('key', 3600, 'value') // Expires in 1 hour

// Get
const value = await redis.get('key')

// Delete
await redis.del('key')
```

### Cache Pattern

```typescript
async function getCachedGuildSettings(guildId: string) {
    const cacheKey = `guild:${guildId}:settings`

    // Try cache first
    const cached = await redis.get(cacheKey)
    if (cached) {
        return JSON.parse(cached)
    }

    // Fetch from database
    const settings = await prisma.guildSettings.findUnique({
        where: { guild: { discordId: guildId } },
    })

    // Cache for 1 hour
    if (settings) {
        await redis.setex(cacheKey, 3600, JSON.stringify(settings))
    }

    return settings
}
```

### List Operations

```typescript
// Push to list
await redis.lpush('queue:tracks', JSON.stringify(track))

// Get list
const tracks = await redis.lrange('queue:tracks', 0, -1)
const parsedTracks = tracks.map((t) => JSON.parse(t))

// Trim list (keep last 100)
await redis.ltrim('queue:tracks', 0, 99)

// Pop from list
const track = await redis.rpop('queue:tracks')
```

### Hash Operations

```typescript
// Set hash fields
await redis.hset('user:123', 'name', 'John')
await redis.hset('user:123', 'volume', '50')

// Get hash field
const name = await redis.hget('user:123', 'name')

// Get all hash fields
const user = await redis.hgetall('user:123')

// Delete hash field
await redis.hdel('user:123', 'name')
```

---

## API Routes

### Basic Express Route

```typescript
// packages/backend/src/routes/guilds.ts
import { Router } from 'express'
import { guildService } from '../services/GuildService.js'

const router = Router()

router.get('/guilds/:guildId', async (req, res) => {
    try {
        const { guildId } = req.params

        const guild = await guildService.getGuild(guildId)

        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' })
        }

        res.json(guild)
    } catch (error) {
        console.error('Error fetching guild:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
```

### Route with Authentication

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/user/guilds', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId

        const guilds = await guildService.getUserGuilds(userId)

        res.json({ guilds })
    } catch (error) {
        console.error('Error fetching user guilds:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
```

### Route with Validation

```typescript
import { Router } from 'express'
import { z } from 'zod'

const router = Router()

const updateSettingsSchema = z.object({
    defaultVolume: z.number().min(0).max(100).optional(),
    autoPlayEnabled: z.boolean().optional(),
    maxQueueSize: z.number().min(1).max(1000).optional(),
})

router.patch('/guilds/:guildId/settings', async (req, res) => {
    try {
        const { guildId } = req.params

        // Validate request body
        const result = updateSettingsSchema.safeParse(req.body)

        if (!result.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: result.error.errors,
            })
        }

        // Update settings
        const settings = await guildService.updateSettings(guildId, result.data)

        res.json(settings)
    } catch (error) {
        console.error('Error updating settings:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
```

---

## Error Handling

### Custom Error Classes

```typescript
// packages/shared/src/utils/errors.ts
export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string,
    ) {
        super(message)
        this.name = 'AppError'
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 404, 'NOT_FOUND')
        this.name = 'NotFoundError'
    }
}

export class ValidationError extends AppError {
    constructor(message: string = 'Validation failed') {
        super(message, 400, 'VALIDATION_ERROR')
        this.name = 'ValidationError'
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED')
        this.name = 'UnauthorizedError'
    }
}
```

### Error Handler Middleware

```typescript
// packages/backend/src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '@nexus/shared'

export function errorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
) {
    console.error('Error:', error)

    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            error: error.message,
            code: error.code,
        })
    }

    // Default error
    res.status(500).json({
        error: 'Internal server error',
    })
}
```

### Async Handler Wrapper

```typescript
// packages/backend/src/utils/asyncHandler.ts
import type { Request, Response, NextFunction } from 'express'

export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}

// Usage
router.get(
    '/guilds/:id',
    asyncHandler(async (req, res) => {
        const guild = await guildService.getGuild(req.params.id)
        res.json(guild)
    }),
)
```

---

## Utilities

### Debug Logging

```typescript
// packages/shared/src/utils/logger.ts
import chalk from 'chalk'

export function debugLog(data: { message: string; data?: any }) {
    if (process.env.NODE_ENV !== 'production') {
        console.log(chalk.blue('[DEBUG]'), data.message)
        if (data.data) {
            console.log(chalk.gray(JSON.stringify(data.data, null, 2)))
        }
    }
}

export function errorLog(data: { message: string; error?: any }) {
    console.error(chalk.red('[ERROR]'), data.message)
    if (data.error) {
        console.error(data.error)
    }
}

export function infoLog(data: { message: string; data?: any }) {
    console.log(chalk.green('[INFO]'), data.message)
    if (data.data) {
        console.log(data.data)
    }
}
```

### Duration Parser

```typescript
// Parse duration strings like "1h", "30m", "1d"
export function parseDuration(duration: string): number {
    const regex = /^(\d+)([smhd])$/
    const match = duration.match(regex)

    if (!match) {
        throw new Error('Invalid duration format')
    }

    const value = parseInt(match[1])
    const unit = match[2]

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    }

    return value * multipliers[unit as keyof typeof multipliers]
}

// Usage
const oneHour = parseDuration('1h') // 3600000
const thirtyMinutes = parseDuration('30m') // 1800000
```

### Retry Logic

```typescript
export async function retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error as Error

            if (attempt < maxAttempts) {
                await new Promise((resolve) =>
                    setTimeout(resolve, delay * attempt),
                )
            }
        }
    }

    throw lastError!
}

// Usage
const data = await retry(() => fetchData(), 3, 1000)
```

---

## Additional Resources

- [Library References](./LIBRARY_REFERENCES.md)
- [Discord.js Reference](./DISCORD_JS_REFERENCE.md)
- [Discord Player Guide](./DISCORD_PLAYER_GUIDE.md)
- [FFmpeg Usage](./FFMPEG_USAGE.md)

---

**Last Updated:** February 2026
