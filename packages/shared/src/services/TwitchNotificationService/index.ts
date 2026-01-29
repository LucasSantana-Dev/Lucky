import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'

export type TwitchNotificationRow = {
  id: string
  guildId: string
  twitchUserId: string
  twitchLogin: string
  discordChannelId: string
  guild?: { discordId: string }
}

function twitchModel(): {
  upsert: (args: unknown) => Promise<unknown>
  deleteMany: (args: unknown) => Promise<unknown>
  findMany: (args: unknown) => Promise<unknown[]>
} {
  return (getPrismaClient() as unknown as { twitchNotification: unknown }).twitchNotification as {
    upsert: (args: unknown) => Promise<unknown>
    deleteMany: (args: unknown) => Promise<unknown>
    findMany: (args: unknown) => Promise<unknown[]>
  }
}

export class TwitchNotificationService {
  async add(
    guildId: string,
    discordChannelId: string,
    twitchUserId: string,
    twitchLogin: string,
  ): Promise<boolean> {
    try {
      const model = twitchModel()
      await model.upsert({
        where: {
          guildId_twitchUserId: { guildId, twitchUserId },
        },
        create: {
          guildId,
          discordChannelId,
          twitchUserId,
          twitchLogin,
        },
        update: { discordChannelId, twitchLogin },
      })
      debugLog({
        message: `Twitch notification added: ${twitchLogin} (${twitchUserId}) -> channel ${discordChannelId} in guild ${guildId}`,
      })
      return true
    } catch (error) {
      errorLog({
        message: 'Failed to add Twitch notification',
        error,
      })
      return false
    }
  }

  async remove(guildId: string, twitchUserId: string): Promise<boolean> {
    try {
      const model = twitchModel()
      await model.deleteMany({
        where: { guildId, twitchUserId },
      })
      debugLog({
        message: `Twitch notification removed: ${twitchUserId} from guild ${guildId}`,
      })
      return true
    } catch (error) {
      errorLog({
        message: 'Failed to remove Twitch notification',
        error,
      })
      return false
    }
  }

  async listByGuild(guildId: string): Promise<TwitchNotificationRow[]> {
    try {
      const model = twitchModel()
      const rows = await model.findMany({
        where: { guildId },
        orderBy: { twitchLogin: 'asc' },
      })
      return rows as TwitchNotificationRow[]
    } catch (error) {
      errorLog({
        message: 'Failed to list Twitch notifications',
        error,
      })
      return []
    }
  }

  async getNotificationsByTwitchUserId(
    twitchUserId: string,
  ): Promise<TwitchNotificationRow[]> {
    try {
      const model = twitchModel()
      const rows = await model.findMany({
        where: { twitchUserId },
        include: { guild: true },
      })
      return rows as TwitchNotificationRow[]
    } catch (error) {
      errorLog({
        message: 'Failed to get Twitch notifications by user id',
        error,
      })
      return []
    }
  }

  async getDistinctTwitchUserIds(): Promise<string[]> {
    try {
      const model = twitchModel()
      const rows = (await model.findMany({
        select: { twitchUserId: true },
        distinct: ['twitchUserId'],
      })) as Array<{ twitchUserId: string }>
      return rows.map((r: { twitchUserId: string }) => r.twitchUserId)
    } catch (error) {
      errorLog({
        message: 'Failed to get distinct Twitch user ids',
        error,
      })
      return []
    }
  }
}

export const twitchNotificationService = new TwitchNotificationService()
