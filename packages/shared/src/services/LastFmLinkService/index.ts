import { getPrismaClient } from '../../utils/database/prismaClient'
import { errorLog, debugLog } from '../../utils/general/log'

export type LastFmLinkRow = {
  sessionKey: string
  lastFmUsername: string | null
}

type LastFmLinkModel = {
  findUnique: (args: { where: { discordId: string } }) => Promise<{ sessionKey: string; lastFmUsername: string | null } | null>
  upsert: (args: {
    where: { discordId: string }
    create: { discordId: string; sessionKey: string; lastFmUsername?: string }
    update: { sessionKey: string; lastFmUsername?: string | null }
  }) => Promise<unknown>
  delete: (args: { where: { discordId: string } }) => Promise<unknown>
}

function lastFmLinkModel(): LastFmLinkModel {
  return (getPrismaClient() as unknown as { lastFmLink: LastFmLinkModel }).lastFmLink
}

export class LastFmLinkService {
  async getByDiscordId(discordId: string): Promise<LastFmLinkRow | null> {
    try {
      const row = await lastFmLinkModel().findUnique({ where: { discordId } })
      return row ? { sessionKey: row.sessionKey, lastFmUsername: row.lastFmUsername } : null
    } catch (error) {
      errorLog({ message: 'Failed to get Last.fm link', error, data: { discordId } })
      return null
    }
  }

  async getSessionKey(discordId: string): Promise<string | null> {
    const row = await this.getByDiscordId(discordId)
    return row?.sessionKey ?? null
  }

  async set(
    discordId: string,
    sessionKey: string,
    lastFmUsername?: string | null,
  ): Promise<boolean> {
    try {
      await lastFmLinkModel().upsert({
        where: { discordId },
        create: {
          discordId,
          sessionKey,
          ...(lastFmUsername != null && lastFmUsername !== '' && { lastFmUsername }),
        },
        update: {
          sessionKey,
          lastFmUsername: lastFmUsername ?? null,
        },
      })
      debugLog({
        message: 'Last.fm link saved',
        data: { discordId, lastFmUsername: lastFmUsername ?? undefined },
      })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to set Last.fm link', error, data: { discordId } })
      return false
    }
  }

  async unlink(discordId: string): Promise<boolean> {
    try {
      await lastFmLinkModel().delete({ where: { discordId } })
      debugLog({ message: 'Last.fm link removed', data: { discordId } })
      return true
    } catch (error) {
      errorLog({ message: 'Failed to unlink Last.fm', error, data: { discordId } })
      return false
    }
  }
}

export const lastFmLinkService = new LastFmLinkService()
