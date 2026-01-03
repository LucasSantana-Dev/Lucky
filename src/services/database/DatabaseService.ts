/**
 * Database service for managing PostgreSQL operations
 */

import { PrismaClient } from '@prisma/client'
import type { UserModel, GuildModel, TrackHistoryModel, CommandUsageModel } from '../../generated/prisma-client/models'
import { Result } from '../../types/common/BaseResult'
import { infoLog, errorLog, debugLog } from '../../utils/general/log'
import type {
  DatabaseUser,
  DatabaseGuild,
  DatabaseTrackHistory,
  DatabaseCommandUsage,
  DatabaseAnalytics,
  DatabaseArtistStats
} from './types'

function assertIsUserModel(value: unknown): asserts value is UserModel {
  if (!value || typeof value !== 'object' || !('id' in value) || !('discordId' in value)) {
    throw new Error('Invalid UserModel')
  }
}

function assertIsGuildModel(value: unknown): asserts value is GuildModel {
  if (!value || typeof value !== 'object' || !('id' in value) || !('discordId' in value)) {
    throw new Error('Invalid GuildModel')
  }
}

function assertIsTrackHistoryModel(value: unknown): asserts value is TrackHistoryModel {
  if (!value || typeof value !== 'object' || !('id' in value) || !('trackId' in value)) {
    throw new Error('Invalid TrackHistoryModel')
  }
}

function assertIsCommandUsageModel(value: unknown): asserts value is CommandUsageModel {
  if (!value || typeof value !== 'object' || !('id' in value) || !('command' in value)) {
    throw new Error('Invalid CommandUsageModel')
  }
}

function assertIsArray<T>(value: unknown): asserts value is T[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid array result')
  }
}

async function typedUserUpsert(
  prisma: PrismaClient,
  params: { where: { discordId: string }; update: { username: string; avatar?: string }; create: { discordId: string; username: string; avatar?: string } }
): Promise<UserModel> {
  const result: unknown = await prisma.user.upsert(params)
  assertIsUserModel(result)
  return result
}

async function typedUserFindUnique(
  prisma: PrismaClient,
  params: { where: { discordId: string } }
): Promise<UserModel | null> {
  const result: unknown = await prisma.user.findUnique(params)
  if (!result) return null
  assertIsUserModel(result)
  return result
}

async function typedGuildUpsert(
  prisma: PrismaClient,
  params: { where: { discordId: string }; update: { name: string; icon?: string }; create: { discordId: string; name: string; ownerId: string; icon?: string } }
): Promise<GuildModel> {
  const result: unknown = await prisma.guild.upsert(params)
  assertIsGuildModel(result)
  return result
}

async function typedGuildFindUnique(
  prisma: PrismaClient,
  params: { where: { discordId: string } }
): Promise<GuildModel | null> {
  const result: unknown = await prisma.guild.findUnique(params)
  if (!result) return null
  assertIsGuildModel(result)
  return result
}

async function typedTrackHistoryCreate(
  prisma: PrismaClient,
  params: Parameters<PrismaClient['trackHistory']['create']>[0]
): Promise<TrackHistoryModel> {
  const result: unknown = await prisma.trackHistory.create(params)
  assertIsTrackHistoryModel(result)
  return result
}

async function typedTrackHistoryFindMany(
  prisma: PrismaClient,
  params: { where: { guild: { discordId: string } }; orderBy: { playedAt: 'desc' }; take: number }
): Promise<TrackHistoryModel[]> {
  const result: unknown = await prisma.trackHistory.findMany(params)
  assertIsArray<TrackHistoryModel>(result)
  return result
}

async function typedCommandUsageCreate(
  prisma: PrismaClient,
  params: Parameters<PrismaClient['commandUsage']['create']>[0]
): Promise<CommandUsageModel> {
  const result: unknown = await prisma.commandUsage.create(params)
  assertIsCommandUsageModel(result)
  return result
}

async function typedRateLimitFindUnique(
  prisma: PrismaClient,
  params: { where: { key: string } }
): Promise<{ resetAt: Date; count: number } | null> {
  const result: unknown = await prisma.rateLimit.findUnique(params)
  if (!result) return null
  if (typeof result !== 'object' || result === null || !('resetAt' in result) || !('count' in result)) {
    throw new Error('Invalid rate limit result')
  }
  const resetAtValue = (result as { resetAt: unknown }).resetAt
  const countValue = (result as { count: unknown }).count
  if (!(resetAtValue instanceof Date) || typeof countValue !== 'number') {
    throw new Error('Invalid rate limit values')
  }
  return { resetAt: resetAtValue, count: countValue }
}

export interface DatabaseConfig {
  url: string
  ttl: number
  maxConnections: number
  connectionTimeout: number
}

export class DatabaseService {
  private readonly prisma: PrismaClient
  private isConnected = false
  private readonly config: DatabaseConfig

  constructor(config: DatabaseConfig) {
    this.config = config

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.config.url,
        },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.prisma as any).$on('query', (e: { query: string; params: string; duration: number }) => {
      debugLog({
        message: 'Database query executed',
        data: {
          query: e.query,
          params: e.params,
          duration: e.duration,
        },
      })
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (this.prisma as any).$on('error', (e: Error) => {
      errorLog({
        message: 'Database error occurred',
        error: e,
      })
    })
  }

  private async executeWithFallback<T>(
    operation: () => Promise<T>,
    _fallback: T,
    operationName: string,
  ): Promise<Result<T>> {
    try {
      const result = await operation()
      return Result.success(result)
    } catch (error) {
      errorLog({ message: `${operationName} failed`, error })
      return Result.failure(error instanceof Error ? error : new Error('Database operation failed'))
    }
  }

  async connect(): Promise<Result<boolean>> {
    return this.executeWithFallback(
      async () => {
        if (this.isConnected) {
          return true
        }

        await this.prisma.$connect()
        this.isConnected = true

        infoLog({ message: 'Database connected successfully' })
        return true
      },
      false,
      'database_connect',
    )
  }

  async disconnect(): Promise<Result<void>> {
    return this.executeWithFallback(
      async () => {
        if (!this.isConnected) {
          return
        }

        await this.prisma.$disconnect()
        this.isConnected = false

        infoLog({ message: 'Database disconnected successfully' })
      },
      undefined,
      'database_disconnect',
    )
  }

  async isHealthy(): Promise<Result<boolean>> {
    return this.executeWithFallback(
      async () => {
        if (!this.isConnected) {
          return false
        }

        await this.prisma.$queryRaw`SELECT 1`
        return true
      },
      false,
      'database_health_check',
    )
  }

  // User operations
  async createUser(discordId: string, username: string, avatar?: string): Promise<Result<DatabaseUser>> {
    return this.executeWithFallback(
      async () => {
        const user = await typedUserUpsert(this.prisma, {
          where: { discordId },
          update: { username, avatar },
          create: { discordId, username, avatar },
        })
        const result: DatabaseUser = {
          id: String(user.id),
          discordId: String(user.discordId),
          username: String(user.username),
          avatar: user.avatar ? String(user.avatar) : undefined,
          createdAt: user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt),
          updatedAt: user.updatedAt instanceof Date ? user.updatedAt : new Date(user.updatedAt)
        }
        return result
      },
      {
        id: '',
        discordId: '',
        username: '',
        avatar: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      'create_user',
    )
  }

  async getUser(discordId: string): Promise<Result<DatabaseUser | null>> {
    return this.executeWithFallback(
      async () => {
        const typedUser = await typedUserFindUnique(this.prisma, {
          where: { discordId },
        })
        if (!typedUser) return null
        const result: DatabaseUser = {
          id: String(typedUser.id),
          discordId: String(typedUser.discordId),
          username: String(typedUser.username),
          avatar: typedUser.avatar ? String(typedUser.avatar) : undefined,
          createdAt: typedUser.createdAt instanceof Date ? typedUser.createdAt : new Date(typedUser.createdAt),
          updatedAt: typedUser.updatedAt instanceof Date ? typedUser.updatedAt : new Date(typedUser.updatedAt)
        }
        return result
      },
      null,
      'get_user',
    )
  }

  // Guild operations
  async createGuild(discordId: string, name: string, ownerId: string, icon?: string): Promise<Result<DatabaseGuild>> {
    return this.executeWithFallback(
      async () => {
        const guild = await typedGuildUpsert(this.prisma, {
          where: { discordId },
          update: { name, icon },
          create: { discordId, name, ownerId, icon },
        })
        const result: DatabaseGuild = {
          id: String(guild.id),
          discordId: String(guild.discordId),
          name: String(guild.name),
          icon: guild.icon ? String(guild.icon) : undefined,
          ownerId: String(guild.ownerId),
          createdAt: guild.createdAt instanceof Date ? guild.createdAt : new Date(guild.createdAt),
          updatedAt: guild.updatedAt instanceof Date ? guild.updatedAt : new Date(guild.updatedAt)
        }
        return result
      },
      {
        id: '',
        discordId: '',
        name: '',
        icon: undefined,
        ownerId: '',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      'create_guild',
    )
  }

  async getGuild(discordId: string): Promise<Result<DatabaseGuild | null>> {
    return this.executeWithFallback(
      async () => {
        const typedGuild = await typedGuildFindUnique(this.prisma, {
          where: { discordId },
        })
        if (!typedGuild) return null
        const result: DatabaseGuild = {
          id: String(typedGuild.id),
          discordId: String(typedGuild.discordId),
          name: String(typedGuild.name),
          icon: typedGuild.icon ? String(typedGuild.icon) : undefined,
          ownerId: String(typedGuild.ownerId),
          createdAt: typedGuild.createdAt instanceof Date ? typedGuild.createdAt : new Date(typedGuild.createdAt),
          updatedAt: typedGuild.updatedAt instanceof Date ? typedGuild.updatedAt : new Date(typedGuild.updatedAt)
        }
        return result
      },
      null,
      'get_guild',
    )
  }

  // Track history operations
  async addTrackToHistory(data: {
    guildId: string
    trackId: string
    title: string
    author: string
    duration: string
    url: string
    thumbnail?: string
    source: string
    playedBy?: string
    isAutoplay?: boolean
  }): Promise<Result<DatabaseTrackHistory>> {
    return this.executeWithFallback(
      async () => {
        const track = await typedTrackHistoryCreate(this.prisma, {
          data: {
            guild: { connect: { discordId: data.guildId } },
            trackId: data.trackId,
            title: data.title,
            author: data.author,
            duration: data.duration,
            url: data.url,
            thumbnail: data.thumbnail,
            source: data.source,
            playedBy: data.playedBy,
            isAutoplay: data.isAutoplay ?? false,
          },
        })
        const result: DatabaseTrackHistory = {
          id: String(track.id),
          guildId: String(track.guildId),
          trackId: String(track.trackId),
          title: String(track.title),
          author: String(track.author),
          duration: String(track.duration),
          url: String(track.url),
          thumbnail: track.thumbnail,
          source: String(track.source),
          playedAt: track.playedAt instanceof Date ? track.playedAt : new Date(track.playedAt),
          createdAt: track.createdAt instanceof Date ? track.createdAt : new Date(track.createdAt),
          playedBy: track.playedBy ? String(track.playedBy) : null,
          isAutoplay: Boolean(track.isAutoplay),
          playlistName: track.playlistName,
          playDuration: track.playDuration ? Number(track.playDuration) : null,
          skipped: track.skipped !== null ? Boolean(track.skipped) : null,
          isPlaylist: track.isPlaylist !== null ? Boolean(track.isPlaylist) : null
        }
        return result
      },
      {
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
        isPlaylist: false
      },
      'add_track_to_history',
    )
  }

  async getTrackHistory(guildId: string, limit = 10): Promise<Result<DatabaseTrackHistory[]>> {
    return this.executeWithFallback(
      async () => {
        const tracks = await typedTrackHistoryFindMany(this.prisma, {
          where: { guild: { discordId: guildId } },
          orderBy: { playedAt: 'desc' },
          take: limit,
        })
        const results: DatabaseTrackHistory[] = tracks.map((track): DatabaseTrackHistory => ({
          id: String(track.id),
          guildId: String(track.guildId),
          trackId: String(track.trackId),
          title: String(track.title),
          author: String(track.author),
          duration: String(track.duration),
          url: String(track.url),
          thumbnail: track.thumbnail,
          source: String(track.source),
          playedAt: track.playedAt instanceof Date ? track.playedAt : new Date(track.playedAt),
          createdAt: track.createdAt instanceof Date ? track.createdAt : new Date(track.createdAt),
          playedBy: track.playedBy ? String(track.playedBy) : null,
          isAutoplay: Boolean(track.isAutoplay),
          playlistName: track.playlistName,
          playDuration: track.playDuration ? Number(track.playDuration) : null,
          skipped: track.skipped !== null ? Boolean(track.skipped) : null,
          isPlaylist: track.isPlaylist !== null ? Boolean(track.isPlaylist) : null
        }))
        return results
      },
      [],
      'get_track_history',
    )
  }

  // Command usage analytics
  async recordCommandUsage(data: {
    userId?: string
    guildId?: string
    command: string
    category: string
    success: boolean
    errorCode?: string
    duration?: number
  }): Promise<Result<DatabaseCommandUsage>> {
    return this.executeWithFallback(
      async () => {
        const usage = await typedCommandUsageCreate(this.prisma, {
          data: {
            user: data.userId ? { connect: { discordId: data.userId } } : undefined,
            guild: data.guildId ? { connect: { discordId: data.guildId } } : undefined,
            command: data.command,
            category: data.category,
            success: data.success,
            errorCode: data.errorCode,
            duration: data.duration,
          },
        })
        const result: DatabaseCommandUsage = {
          id: String(usage.id),
          userId: usage.userId ? String(usage.userId) : null,
          guildId: usage.guildId ? String(usage.guildId) : null,
          command: String(usage.command),
          category: String(usage.category),
          success: Boolean(usage.success),
          errorCode: usage.errorCode ? String(usage.errorCode) : null,
          duration: usage.duration ? Number(usage.duration) : null,
          createdAt: usage.createdAt instanceof Date ? usage.createdAt : new Date(usage.createdAt)
        }
        return result
      },
      {
        id: '',
        userId: null,
        guildId: null,
        command: '',
        category: '',
        success: false,
        errorCode: null,
        duration: null,
        createdAt: new Date()
      } as DatabaseCommandUsage,
      'record_command_usage',
    )
  }

  // Rate limiting
  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<Result<boolean>> {
    return this.executeWithFallback(
      async () => {
        const now = new Date()
        const resetAt = new Date(now.getTime() + windowMs)

        const existing = await typedRateLimitFindUnique(this.prisma, {
          where: { key },
        })

        if (!existing) {
          await this.prisma.rateLimit.upsert({
            where: { key },
            update: { count: 1, resetAt },
            create: { key, count: 1, resetAt },
          })
          return true
        }

        const resetAtDate = existing.resetAt
        if (resetAtDate < now) {
          await this.prisma.rateLimit.upsert({
            where: { key },
            update: { count: 1, resetAt },
            create: { key, count: 1, resetAt },
          })
          return true
        }

        const count = existing.count
        if (count >= limit) {
          return false
        }

        // Increment count
        await this.prisma.rateLimit.update({
          where: { key },
          data: { count: count + 1 },
        })

        return true
      },
      false,
      'check_rate_limit',
    )
  }

  // Analytics queries
  async getTopTracks(guildId: string, limit = 10): Promise<Result<DatabaseAnalytics[]>> {
    return this.executeWithFallback(
      async () => {
        const tracksResult: unknown = await this.prisma.trackHistory.groupBy({
          by: ['trackId', 'title', 'author'],
          where: { guild: { discordId: guildId } },
          _count: { trackId: true },
          orderBy: { _count: { trackId: 'desc' } },
          take: limit,
        })
        assertIsArray(tracksResult)
        type TrackGroupByResult = {
          trackId: string
          title: string
          author: string
          _count: { trackId: number }
        }
        const typedTracks: TrackGroupByResult[] = []
        for (const track of tracksResult) {
          if (typeof track === 'object' && track !== null && 'trackId' in track && 'title' in track && 'author' in track && '_count' in track) {
            typedTracks.push(track as TrackGroupByResult)
          }
        }
        const results: DatabaseAnalytics[] = typedTracks.map((track): DatabaseAnalytics => ({
          trackId: String(track.trackId),
          title: String(track.title),
          author: String(track.author),
          playCount: Number(track._count.trackId)
        }))
        return results
      },
      [],
      'get_top_tracks',
    )
  }

  async getTopArtists(guildId: string, limit = 10): Promise<Result<DatabaseArtistStats[]>> {
    return this.executeWithFallback(
      async () => {
        const artistsResult: unknown = await this.prisma.trackHistory.groupBy({
          by: ['author'],
          where: { guild: { discordId: guildId } },
          _count: { author: true },
          orderBy: { _count: { author: 'desc' } },
          take: limit,
        })
        assertIsArray(artistsResult)
        type ArtistGroupByResult = {
          author: string
          _count: { author: number }
        }
        const typedArtists: ArtistGroupByResult[] = []
        for (const artist of artistsResult) {
          if (typeof artist === 'object' && artist !== null && 'author' in artist && '_count' in artist) {
            typedArtists.push(artist as ArtistGroupByResult)
          }
        }
        const results: DatabaseArtistStats[] = typedArtists.map((artist): DatabaseArtistStats => ({
          author: String(artist.author),
          playCount: Number(artist._count.author)
        }))
        return results
      },
      [],
      'get_top_artists',
    )
  }

  // Cleanup operations
  async cleanupOldData(): Promise<Result<number>> {
    return this.executeWithFallback(
      async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

        const deleteResultsRaw: unknown = await Promise.all([
          this.prisma.trackHistory.deleteMany({
            where: { playedAt: { lt: thirtyDaysAgo } },
          }),
          this.prisma.commandUsage.deleteMany({
            where: { createdAt: { lt: thirtyDaysAgo } },
          }),
          this.prisma.rateLimit.deleteMany({
            where: { resetAt: { lt: new Date() } },
          }),
        ])
        if (!Array.isArray(deleteResultsRaw) || deleteResultsRaw.length !== 3) {
          throw new Error('Invalid delete results from database')
        }
        const deleteResults: unknown[] = deleteResultsRaw

        const deletedTracksResult: unknown = deleteResults[0]
        const deletedUsageResult: unknown = deleteResults[1]
        const deletedRateLimitsResult: unknown = deleteResults[2]

        if (typeof deletedTracksResult !== 'object' || deletedTracksResult === null || !('count' in deletedTracksResult)) {
          throw new Error('Invalid delete result from database')
        }
        if (typeof deletedUsageResult !== 'object' || deletedUsageResult === null || !('count' in deletedUsageResult)) {
          throw new Error('Invalid delete result from database')
        }
        if (typeof deletedRateLimitsResult !== 'object' || deletedRateLimitsResult === null || !('count' in deletedRateLimitsResult)) {
          throw new Error('Invalid delete result from database')
        }

        const tracksCountValue = (deletedTracksResult as { count: unknown }).count
        const usageCountValue = (deletedUsageResult as { count: unknown }).count
        const rateLimitsCountValue = (deletedRateLimitsResult as { count: unknown }).count

        if (typeof tracksCountValue !== 'number' || typeof usageCountValue !== 'number' || typeof rateLimitsCountValue !== 'number') {
          throw new Error('Invalid count values from database')
        }

        const tracksCount = tracksCountValue
        const usageCount = usageCountValue
        const rateLimitsCount = rateLimitsCountValue
        const totalDeleted = tracksCount + usageCount + rateLimitsCount
        return totalDeleted
      },
      0,
      'cleanup_old_data',
    )
  }

  // Get Prisma client for direct access
  getClient(): PrismaClient {
    return this.prisma
  }

  protected getRedisKey(identifier: string): string {
    return `database:${identifier}`
  }
}
