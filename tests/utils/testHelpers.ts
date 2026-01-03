/**
 * Test utilities and helpers
 */

import { jest } from '@jest/globals'
import type { Result } from '../../src/types/common/BaseResult'

export interface MockDiscordInteraction {
  user: {
    id: string
    username: string
    tag: string
    displayAvatarURL: () => string
  }
  guild: {
    id: string
    name: string
  } | null
  channel: {
    id: string
    name: string
  } | null
  commandName: string
  options: {
    getString: (name: string) => string | null
    getBoolean: (name: string) => boolean | null
    getInteger: (name: string) => number | null
  }
  reply: jest.MockedFunction<any>
  followUp: jest.MockedFunction<any>
  deferReply: jest.MockedFunction<any>
  editReply: jest.MockedFunction<any>
}

export interface MockDiscordClient {
  user: {
    id: string
    username: string
    displayAvatarURL: () => string
  }
  commands: Map<string, any>
  guilds: Map<string, any>
  login: jest.MockedFunction<any>
  on: jest.MockedFunction<any>
}

export function createMockInteraction(overrides: Partial<MockDiscordInteraction> = {}): MockDiscordInteraction {
  return {
    user: {
      id: '123456789',
      username: 'testuser',
      tag: 'testuser#1234',
      displayAvatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png') as any,
    },
    guild: {
      id: '987654321',
      name: 'Test Guild',
    },
    channel: {
      id: '111222333',
      name: 'general',
    },
    commandName: 'test',
    options: {
      getString: jest.fn().mockReturnValue(null) as any,
      getBoolean: jest.fn().mockReturnValue(null) as any,
      getInteger: jest.fn().mockReturnValue(null) as any,
    },
    reply: jest.fn() as any,
    followUp: jest.fn() as any,
    deferReply: jest.fn() as any,
    editReply: jest.fn() as any,
    ...overrides,
  }
}

export function createMockClient(overrides: Partial<MockDiscordClient> = {}): MockDiscordClient {
  return {
    user: {
      id: 'bot123',
      username: 'TestBot',
      displayAvatarURL: jest.fn().mockReturnValue('https://example.com/bot-avatar.png') as any,
    },
    commands: new Map(),
    guilds: new Map(),
    login: jest.fn() as any,
    on: jest.fn(),
    ...overrides,
  }
}

export function createMockTrack(overrides: any = {}) {
  return {
    id: 'track123',
    title: 'Test Track',
    author: 'Test Artist',
    duration: '3:30',
    url: 'https://youtube.com/watch?v=test',
    thumbnail: 'https://example.com/thumbnail.jpg',
    source: 'youtube',
    ...overrides,
  }
}

export function createMockGuild(overrides: any = {}) {
  return {
    id: 'guild123',
    name: 'Test Guild',
    ownerId: 'owner123',
    icon: 'https://example.com/guild-icon.png',
    ...overrides,
  }
}

export function createMockUser(overrides: any = {}) {
  return {
    id: 'user123',
    discordId: '123456789',
    username: 'testuser',
    avatar: 'https://example.com/avatar.png',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createMockResult<T>(data?: T, success = true, error?: string): Result<T> {
  if (success) {
    return {
      isSuccess: true,
      isFailure: false,
      getData: () => data,
      getError: () => undefined,
      getMessage: () => undefined,
      success: true,
      map: jest.fn(),
      flatMap: jest.fn(),
    } as any
  } else {
    return {
      isSuccess: false,
      isFailure: true,
      getData: () => undefined,
      getError: () => new Error(error || 'Test error'),
      getMessage: () => error || 'Test error',
      success: false,
      map: jest.fn(),
      flatMap: jest.fn(),
    } as any
  }
}

export function createMockRedisClient() {
  return {
    connect: jest.fn() as any,
    disconnect: jest.fn() as any,
    get: jest.fn() as any,
    set: jest.fn() as any,
    del: jest.fn() as any,
    exists: jest.fn() as any,
    expire: jest.fn() as any,
    isHealthy: jest.fn().mockReturnValue(true),
    ping: jest.fn() as any,
  }
}

export function createMockPrismaClient() {
  return {
    $connect: jest.fn() as any,
    $disconnect: jest.fn() as any,
    $queryRaw: jest.fn() as any,
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
  }
}

export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function expectResultSuccess<T>(result: Result<T>, expectedData?: T): void {
  expect(result.isSuccess()).toBe(true)
  expect(result.isFailure()).toBe(false)
  if (expectedData !== undefined) {
    expect(result.getData()).toEqual(expectedData)
  }
}

export function expectResultFailure<T>(result: Result<T>, expectedError?: string): void {
  expect(result.isSuccess()).toBe(false)
  expect(result.isFailure()).toBe(true)
  if (expectedError) {
    expect(result.getError()?.message).toBe(expectedError)
  }
}

export function createMockConfig() {
  return {
    ttl: 3600,
    maxConnections: 10,
    connectionTimeout: 30000,
  }
}

export function createMockServiceConfig() {
  return {
    ttl: 3600,
    maxHistorySize: 100,
    trackHistoryTtl: 86400,
    metadataTtl: 3600,
    settingsTtl: 3600,
    counterTtl: 3600,
    defaultMaxAutoplayTracks: 10,
    defaultVolume: 50,
    defaultRepeatMode: 0,
  }
}

export function createMockTrackHistoryConfig() {
  return {
    ttl: 3600,
    maxHistorySize: 100,
    trackHistoryTtl: 86400,
    metadataTtl: 3600,
  }
}

export function createMockDatabaseConfig() {
  return {
    url: 'postgresql://test:test@localhost:5432/test',
    ttl: 3600,
    maxConnections: 10,
    connectionTimeout: 5000,
  }
}

export function createMockSessionConfig() {
  return {
    userSessionTtl: 3600,
    queueSessionTtl: 3600,
    maxCommandHistory: 100,
    sessionCleanupInterval: 300,
    ttl: 3600,
    maxSize: 1000,
    cleanupInterval: 300,
  }
}
