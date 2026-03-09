# Lucky Library & Dependency References

Quick reference guide for all major dependencies used in Lucky. This document provides direct links to official documentation, common patterns, and quick start examples.

## Table of Contents

- [Discord Libraries](#discord-libraries)
- [Audio Processing](#audio-processing)
- [Database & Caching](#database--caching)
- [Backend & Frontend](#backend--frontend)
- [Utilities](#utilities)
- [Development Tools](#development-tools)

---

## Discord Libraries

### discord.js (v14.25.1)

The core Discord API wrapper for Node.js.

- **Official Docs:** https://discord.js.org/docs/packages/discord.js/14.25.1
- **Guide:** https://discordjs.guide/
- **GitHub:** https://github.com/discordjs/discord.js
- **API Reference:** https://discord.js.org/docs/packages/discord.js/14.25.1/api

**Quick Start:**

```typescript
import { Client, GatewayIntentBits } from 'discord.js'

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
    ],
})

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`)
})

client.login(process.env.DISCORD_TOKEN)
```

**Common Operations:**

- [Creating Slash Commands](https://discordjs.guide/slash-commands/advanced-creation.html)
- [Handling Interactions](https://discordjs.guide/interactions/slash-commands.html)
- [Permissions](https://discordjs.guide/popular-topics/permissions.html)
- [Embeds](https://discordjs.guide/popular-topics/embeds.html)
- [Voice Connections](https://discordjs.guide/voice/voice-connections.html)
- [Buttons & Select Menus](https://discordjs.guide/message-components/buttons.html)
- [Modals](https://discordjs.guide/interactions/modals.html)

**Key Concepts:**

- **Intents:** Control what events your bot receives
- **Interactions:** Modern way to handle user input (slash commands, buttons, etc.)
- **Permissions:** Role-based access control
- **Collections:** Extended Map with utility methods

---

### discord-player (v7.1.0)

Complete framework for Discord music bots with queue management and audio playback.

- **Official Docs:** https://discord-player.js.org/
- **GitHub:** https://github.com/Androz2091/discord-player
- **Examples:** https://github.com/Androz2091/discord-player/tree/master/examples
- **Discord Server:** https://discord.gg/musicplayer

**Quick Start:**

```typescript
import { Player } from 'discord-player'

const player = new Player(client)

// Load default extractors (YouTube, Spotify, etc.)
await player.extractors.loadDefault()

// Play a song
const queue = player.nodes.create(interaction.guild)
const result = await player.search(query, {
    requestedBy: interaction.user,
})

await queue.addTrack(result.tracks[0])
if (!queue.isPlaying()) await queue.node.play()
```

**Common Operations:**

- [Getting Started](https://discord-player.js.org/guide/getting-started)
- [Queue Management](https://discord-player.js.org/guide/queue)
- [Extractors](https://discord-player.js.org/guide/extractors)
- [Events](https://discord-player.js.org/guide/events)
- [Audio Filters](https://discord-player.js.org/guide/audio-filters)
- [Error Handling](https://discord-player.js.org/guide/error-handling)

**Key Features:**

- Built-in queue system
- Multiple audio sources (YouTube, Spotify, SoundCloud, etc.)
- Audio filters and effects
- Playlist support
- Live stream support

**See Also:** [Discord Player Integration Guide](./DISCORD_PLAYER_GUIDE.md)

---

### @discordjs/builders (v1.13.1)

Utility library for building Discord API objects.

- **Official Docs:** https://discord.js.org/docs/packages/builders/1.13.1
- **GitHub:** https://github.com/discordjs/discord.js/tree/main/packages/builders

**Quick Start:**

```typescript
import { SlashCommandBuilder, EmbedBuilder } from '@discordjs/builders'

// Slash Command
const command = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song')
    .addStringOption((option) =>
        option
            .setName('query')
            .setDescription('Song name or URL')
            .setRequired(true),
    )

// Embed
const embed = new EmbedBuilder()
    .setTitle('Now Playing')
    .setDescription('Song Title')
    .setColor('#5865F2')
    .setTimestamp()
```

**Available Builders:**

- `SlashCommandBuilder` - Create slash commands
- `EmbedBuilder` - Create rich embeds
- `ActionRowBuilder` - Create button/select menu rows
- `ButtonBuilder` - Create buttons
- `SelectMenuBuilder` - Create select menus
- `ModalBuilder` - Create modals

---

### @discordjs/opus (v0.10.0)

Native Opus codec bindings for high-quality voice.

- **GitHub:** https://github.com/discordjs/opus
- **NPM:** https://www.npmjs.com/package/@discordjs/opus

**Note:** This is an optional dependency. If not installed, discord.js will fall back to other opus libraries or FFmpeg.

**Installation:**

```bash
npm install @discordjs/opus
```

**Usage:**
Automatically used by discord.js for voice encoding when available. No manual configuration needed.

---

## Audio Processing

### ffmpeg-static (v5.3.0)

Static FFmpeg binaries for Node.js.

- **GitHub:** https://github.com/eugeneware/ffmpeg-static
- **NPM:** https://www.npmjs.com/package/ffmpeg-static
- **FFmpeg Docs:** https://ffmpeg.org/documentation.html

**Quick Start:**

```typescript
import ffmpeg from 'ffmpeg-static'
import { spawn } from 'child_process'

const process = spawn(ffmpeg, [
    '-i',
    inputFile,
    '-f',
    'mp3',
    '-ar',
    '48000',
    '-ac',
    '2',
    outputFile,
])
```

**See Also:** [FFmpeg Usage Guide](./FFMPEG_USAGE.md)

---

### play-dl (v1.9.7)

YouTube and Spotify audio extraction library.

- **GitHub:** https://github.com/play-dl/play-dl
- **NPM:** https://www.npmjs.com/package/play-dl
- **Docs:** https://play-dl.github.io/

**Quick Start:**

```typescript
import play from 'play-dl'

// YouTube
const stream = await play.stream('https://youtube.com/watch?v=...')

// Spotify (requires client ID/secret)
play.setToken({
    spotify: {
        client_id: 'your_client_id',
        client_secret: 'your_client_secret',
    },
})

const info = await play.spotify('https://open.spotify.com/track/...')
```

**Features:**

- YouTube video/playlist info
- Spotify track/playlist info
- Audio stream extraction
- Search functionality

---

### youtubei.js (v16.0.1)

Full-featured YouTube API wrapper.

- **GitHub:** https://github.com/LuanRT/YouTube.js
- **NPM:** https://www.npmjs.com/package/youtubei.js
- **Docs:** https://github.com/LuanRT/YouTube.js/tree/main/docs

**Quick Start:**

```typescript
import { Innertube } from 'youtubei.js'

const youtube = await Innertube.create()

// Search
const search = await youtube.search('query')

// Video info
const info = await youtube.getInfo('video_id')

// Download
const stream = await youtube.download('video_id', {
    type: 'audio',
    quality: 'best',
})
```

**Features:**

- No API key required
- Search, video info, playlists
- Download videos/audio
- Live stream support

---

### discord-player-youtubei (v1.5.0)

YouTube extractor for discord-player using youtubei.js.

- **GitHub:** https://github.com/retrouser955/discord-player-youtubei
- **NPM:** https://www.npmjs.com/package/discord-player-youtubei

**Quick Start:**

```typescript
import { Player } from 'discord-player'
import { YouTubeExtractor } from 'discord-player-youtubei'

const player = new Player(client)
await player.extractors.register(YouTubeExtractor, {})
```

**Configuration:**

```typescript
await player.extractors.register(YouTubeExtractor, {
    authentication: 'your_oauth_token', // Optional
    streamOptions: {
        useClient: 'ANDROID', // or 'WEB', 'IOS'
    },
})
```

---

## Database & Caching

### Prisma (v7.3.0)

Next-generation ORM for Node.js and TypeScript.

- **Official Docs:** https://www.prisma.io/docs
- **Getting Started:** https://www.prisma.io/docs/getting-started
- **Schema Reference:** https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference
- **Client API:** https://www.prisma.io/docs/reference/api-reference/prisma-client-reference
- **Migrations:** https://www.prisma.io/docs/concepts/components/prisma-migrate

**Quick Start:**

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Create
const user = await prisma.user.create({
    data: {
        discordId: '123456789',
        username: 'User#1234',
    },
})

// Read
const users = await prisma.user.findMany({
    where: { discordId: '123456789' },
})

// Update
await prisma.user.update({
    where: { id: user.id },
    data: { username: 'NewName#1234' },
})

// Delete
await prisma.user.delete({
    where: { id: user.id },
})
```

**Common Operations:**

- [CRUD Operations](https://www.prisma.io/docs/concepts/components/prisma-client/crud)
- [Relations](https://www.prisma.io/docs/concepts/components/prisma-schema/relations)
- [Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [Aggregations](https://www.prisma.io/docs/concepts/components/prisma-client/aggregation-grouping-summarizing)

**CLI Commands:**

```bash
npx prisma generate      # Generate Prisma Client
npx prisma migrate dev   # Create and apply migration
npx prisma studio        # Open Prisma Studio (GUI)
npx prisma db push       # Push schema to database
```

---

### ioredis (v5.9.2)

Robust, performance-focused Redis client for Node.js.

- **Official Docs:** https://redis.github.io/ioredis/
- **GitHub:** https://github.com/redis/ioredis
- **Redis Commands:** https://redis.io/commands/

**Quick Start:**

```typescript
import Redis from 'ioredis'

const redis = new Redis({
    host: 'localhost',
    port: 6379,
    password: 'your_password',
    db: 0,
})

// String operations
await redis.set('key', 'value')
const value = await redis.get('key')

// Expiration
await redis.setex('key', 3600, 'value') // Expires in 1 hour

// Hash operations
await redis.hset('user:1', 'name', 'John')
const name = await redis.hget('user:1', 'name')

// Lists
await redis.lpush('queue', 'item1')
const item = await redis.rpop('queue')
```

**Common Patterns:**

- [Caching](https://redis.io/docs/manual/patterns/caching/)
- [Pub/Sub](https://redis.github.io/ioredis/classes/Redis.html#publish)
- [Rate Limiting](https://redis.io/docs/manual/patterns/rate-limiter/)
- [Sessions](https://redis.io/docs/manual/patterns/session-store/)

**Error Handling:**

```typescript
redis.on('error', (err) => {
    console.error('Redis error:', err)
})

redis.on('connect', () => {
    console.log('Connected to Redis')
})
```

---

## Backend & Frontend

### Express (v5.x)

Fast, unopinionated web framework for Node.js.

- **Official Docs:** https://expressjs.com/
- **API Reference:** https://expressjs.com/en/5x/api.html
- **Guide:** https://expressjs.com/en/guide/routing.html

**Quick Start:**

```typescript
import express from 'express'

const app = express()

app.use(express.json())

app.get('/api/users', (req, res) => {
    res.json({ users: [] })
})

app.listen(3000, () => {
    console.log('Server running on port 3000')
})
```

**Common Middleware:**

- `express.json()` - Parse JSON bodies
- `express.urlencoded()` - Parse URL-encoded bodies
- `cors()` - Enable CORS
- `express-session` - Session management

---

### React (v19.x)

JavaScript library for building user interfaces.

- **Official Docs:** https://react.dev/
- **Learn React:** https://react.dev/learn
- **API Reference:** https://react.dev/reference/react
- **Hooks:** https://react.dev/reference/react/hooks

**Quick Start:**

```typescript
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}
```

**Common Hooks:**

- `useState` - State management
- `useEffect` - Side effects
- `useContext` - Context API
- `useMemo` - Memoization
- `useCallback` - Callback memoization

---

### Vite (v7.x)

Next-generation frontend build tool.

- **Official Docs:** https://vite.dev/
- **Config Reference:** https://vite.dev/config/
- **Guide:** https://vite.dev/guide/

**Quick Start:**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
    },
})
```

**Common Commands:**

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

---

## Utilities

### Zod (v3.25.76)

TypeScript-first schema validation library.

- **Official Docs:** https://zod.dev/
- **GitHub:** https://github.com/colinhacks/zod

**Quick Start:**

```typescript
import { z } from 'zod'

// Define schema
const userSchema = z.object({
    username: z.string().min(3).max(20),
    email: z.string().email(),
    age: z.number().min(13).optional(),
})

// Parse and validate
const user = userSchema.parse({
    username: 'john_doe',
    email: 'john@example.com',
})

// Type inference
type User = z.infer<typeof userSchema>
```

**Common Patterns:**

- [Primitives](https://zod.dev/?id=primitives)
- [Objects](https://zod.dev/?id=objects)
- [Arrays](https://zod.dev/?id=arrays)
- [Unions](https://zod.dev/?id=unions)
- [Error Handling](https://zod.dev/?id=error-handling)

---

### Unleash Client (v5.4.0)

Feature toggle/flag management.

- **Official Docs:** https://docs.getunleash.io/
- **Node.js SDK:** https://docs.getunleash.io/reference/sdks/node
- **GitHub:** https://github.com/Unleash/unleash-client-node

**Quick Start:**

```typescript
import { initialize } from 'unleash-client'

const unleash = initialize({
    url: 'http://localhost:4242/api',
    appName: 'lucky',
    customHeaders: {
        Authorization: 'your_api_token',
    },
})

unleash.on('ready', () => {
    if (unleash.isEnabled('MUSIC_PLAYBACK')) {
        // Feature is enabled
    }
})
```

**Context:**

```typescript
const context = {
    userId: 'user_123',
    properties: {
        guildId: 'guild_456',
    },
}

const enabled = unleash.isEnabled('FEATURE_NAME', context)
```

---

### Sentry (v10.37.0)

Application monitoring and error tracking.

- **Official Docs:** https://docs.sentry.io/
- **Node.js:** https://docs.sentry.io/platforms/node/
- **Performance:** https://docs.sentry.io/platforms/node/performance/

**Quick Start:**

```typescript
import * as Sentry from '@sentry/node'

Sentry.init({
    dsn: 'your_sentry_dsn',
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
})

// Capture exception
try {
    // Code that might throw
} catch (error) {
    Sentry.captureException(error)
}

// Add context
Sentry.setUser({ id: 'user_123' })
Sentry.setTag('guild', 'guild_456')
```

**Features:**

- Error tracking
- Performance monitoring
- Release tracking
- User feedback

---

## Development Tools

### TypeScript (v5.9.3)

JavaScript with syntax for types.

- **Official Docs:** https://www.typescriptlang.org/docs/
- **Handbook:** https://www.typescriptlang.org/docs/handbook/intro.html
- **Playground:** https://www.typescriptlang.org/play

**Quick Start:**

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

### ESLint (v9.x)

Pluggable JavaScript linter.

- **Official Docs:** https://eslint.org/docs/latest/
- **Rules:** https://eslint.org/docs/latest/rules/
- **Configuration:** https://eslint.org/docs/latest/use/configure/

**Quick Start:**

```javascript
// eslint.config.js
import js from '@eslint/js'
import typescript from '@typescript-eslint/eslint-plugin'

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        plugins: { typescript },
        rules: {
            'no-console': 'warn',
        },
    },
]
```

---

### Prettier (v3.8.1)

Opinionated code formatter.

- **Official Docs:** https://prettier.io/docs/en/
- **Options:** https://prettier.io/docs/en/options.html

**Quick Start:**

```json
// .prettierrc
{
    "semi": false,
    "singleQuote": true,
    "tabWidth": 4,
    "trailingComma": "es5"
}
```

---

## Additional Resources

### Lucky-Specific Guides

- [FFmpeg Usage Guide](./FFMPEG_USAGE.md) - Detailed FFmpeg documentation
- [Discord.js Reference](./DISCORD_JS_REFERENCE.md) - Discord.js quick reference
- [Discord Player Guide](./DISCORD_PLAYER_GUIDE.md) - Discord Player integration
- [Code Examples](./CODE_EXAMPLES.md) - Common code patterns
- [Dependencies Overview](./DEPENDENCIES.md) - High-level dependency strategy

### External Resources

- [Discord Developer Portal](https://discord.com/developers/docs)
- [Discord.js Guide](https://discordjs.guide/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

---

## Version Information

This documentation is current as of the following versions:

| Package        | Version | Last Updated |
| -------------- | ------- | ------------ |
| discord.js     | 14.25.1 | 2026-02      |
| discord-player | 7.1.0   | 2026-02      |
| Prisma         | 7.3.0   | 2026-02      |
| React          | 19.x    | 2026-02      |
| Vite           | 7.x     | 2026-02      |

For the most up-to-date version information, check `package.json` files in each workspace.

---

**Last Updated:** February 2026
