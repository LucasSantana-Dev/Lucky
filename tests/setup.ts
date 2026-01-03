/**
 * Jest test setup file
 */

import { jest } from '@jest/globals'

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DISCORD_TOKEN = 'test-token'
process.env.CLIENT_ID = 'test-client-id'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_HOST = 'localhost'
process.env.REDIS_PORT = '6379'

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
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn(),
    on: jest.fn(),
    user: { id: 'test-bot-id', username: 'TestBot' },
    commands: new Map(),
    guilds: new Map(),
  })),
  Events: {
    ClientReady: 'ready',
    InteractionCreate: 'interactionCreate',
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildVoiceStates: 2,
  },
  EmbedBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setThumbnail: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
  })),
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
    addBooleanOption: jest.fn().mockReturnThis(),
    addIntegerOption: jest.fn().mockReturnThis(),
    toJSON: jest.fn().mockReturnValue({}),
  })),
  ChatInputCommandInteraction: jest.fn(),
  Interaction: jest.fn(),
  User: jest.fn(),
  Guild: jest.fn(),
  Channel: jest.fn(),
}))

// Mock discord-player
jest.mock('discord-player', () => ({
  Player: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    search: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
    skip: jest.fn(),
    setVolume: jest.fn(),
    setRepeatMode: jest.fn(),
    setShuffle: jest.fn(),
    extractors: {
      register: jest.fn(),
    },
  })),
  QueryType: {
    YOUTUBE: 'youtube',
    SPOTIFY: 'spotify',
    YOUTUBE_PLAYLIST: 'youtube_playlist',
    SPOTIFY_PLAYLIST: 'spotify_playlist',
  },
  QueueRepeatMode: {
    OFF: 0,
    TRACK: 1,
    QUEUE: 2,
  },
}))

// Mock Redis with simplified approach
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    isHealthy: jest.fn(),
    ping: jest.fn(),
  }))
})

// Mock Prisma with simplified approach
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    guild: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    trackHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
    commandUsage: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    rateLimit: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  })),
}))

// Mock Sentry
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}))

// Mock file system operations
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('{}'),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
}))

// Mock path operations
jest.mock('path', () => ({
  resolve: jest.fn((...args) => args.join('/')),
  join: jest.fn((...args) => args.join('/')),
  dirname: jest.fn(),
  basename: jest.fn(),
}))

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidResult(): R
      toBeValidError(): R
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidResult(received: any) {
    const pass = received &&
                 typeof received === 'object' &&
                 'success' in received &&
                 typeof received.success === 'boolean'

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Result object`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be a valid Result object`,
        pass: false,
      }
    }
  },

  toBeValidError(received: any) {
    const pass = received instanceof Error ||
                 (received && typeof received === 'object' && 'message' in received)

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Error`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be a valid Error`,
        pass: false,
      }
    }
  },
})

// Test database cleanup
afterAll(async () => {
  // Clean up any test data
  jest.clearAllMocks()
})