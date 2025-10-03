/**
 * Jest test setup file
 * Configures test environment and global mocks
 */

import { jest } from "@jest/globals"

// Mock environment variables
process.env.NODE_ENV = "test"
process.env.DISCORD_TOKEN = "test-token"
process.env.CLIENT_ID = "test-client-id"
process.env.REDIS_HOST = "localhost"
process.env.REDIS_PORT = "6379"
process.env.SPOTIFY_CLIENT_ID = "test-spotify-id"
process.env.SPOTIFY_CLIENT_SECRET = "test-spotify-secret"

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}

// Mock Discord.js
jest.mock("discord.js", () => ({
    Client: jest.fn().mockImplementation(() => ({
        login: jest.fn(),
        on: jest.fn(),
        user: { id: "test-bot-id", username: "TestBot" },
        commands: new Map(),
        player: {},
    })),
    GatewayIntentBits: {
        Guilds: 1,
        GuildVoiceStates: 2,
        GuildMessages: 3,
    },
    Events: {
        Ready: "ready",
        InteractionCreate: "interactionCreate",
    },
    Collection: Map,
    EmbedBuilder: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        setThumbnail: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
    })),
}))

// Mock discord-player
jest.mock("discord-player", () => ({
    Player: jest.fn().mockImplementation(() => ({
        extractors: {
            register: jest.fn(),
        },
        search: jest.fn(),
        play: jest.fn(),
    })),
    QueryType: {
        YOUTUBE_SEARCH: "youtube",
        YOUTUBE_PLAYLIST: "youtube_playlist",
        SPOTIFY_SONG: "spotify",
        SPOTIFY_PLAYLIST: "spotify_playlist",
    },
}))

// Mock Redis
jest.mock("ioredis", () => {
    return jest.fn().mockImplementation(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        exists: jest.fn(),
        expire: jest.fn(),
        on: jest.fn(),
    }))
})

// Mock play-dl
jest.mock("play-dl", () => ({
    video_basic_info: jest.fn(),
    stream: jest.fn(),
    validate: jest.fn(),
}))

// Mock fluent-ffmpeg
jest.mock("fluent-ffmpeg", () => {
    return jest.fn().mockImplementation(() => ({
        input: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis(),
        run: jest.fn().mockReturnThis(),
    }))
})

// Mock fs
jest.mock("fs", () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
}))

// Mock path
jest.mock("path", () => ({
    resolve: jest.fn((...args) => args.join("/")),
    join: jest.fn((...args) => args.join("/")),
    dirname: jest.fn(),
    basename: jest.fn(),
    extname: jest.fn(),
}))

// Mock Sentry
jest.mock("@sentry/node", () => ({
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    setUser: jest.fn(),
    setTag: jest.fn(),
    setContext: jest.fn(),
    withScope: jest.fn((callback: any) => callback({})),
    getCurrentHub: jest.fn(() => ({
        getClient: jest.fn(() => ({
            captureException: jest.fn(),
            captureMessage: jest.fn(),
        })),
    })),
}))

// Mock Sentry Node Core
jest.mock("@sentry/node-core", () => ({
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    setUser: jest.fn(),
    setTag: jest.fn(),
    setContext: jest.fn(),
    withScope: jest.fn((callback: any) => callback({})),
    getCurrentHub: jest.fn(() => ({
        getClient: jest.fn(() => ({
            captureException: jest.fn(),
            captureMessage: jest.fn(),
        })),
    })),
}))

// Global test timeout
jest.setTimeout(10000)
