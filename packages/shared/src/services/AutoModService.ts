import { getPrismaClient } from '../utils/database/prismaClient.js'
import { redisClient } from './redis/index.js'
import { errorLog } from '../utils/general/log.js'

const prisma = getPrismaClient()
const CACHE_TTL = 300
const CACHE_PREFIX = 'automod:'

interface AutoModSettings {
    id: string
    guildId: string
    enabled: boolean
    spamEnabled: boolean
    spamThreshold: number
    spamTimeWindow: number
    capsEnabled: boolean
    capsThreshold: number
    linksEnabled: boolean
    allowedDomains: string[]
    invitesEnabled: boolean
    wordsEnabled: boolean
    bannedWords: string[]
    exemptRoles: string[]
    exemptChannels: string[]
    createdAt: Date
    updatedAt: Date
}

export class AutoModService {
    async getSettings(guildId: string): Promise<AutoModSettings | null> {
        if (redisClient.isHealthy()) {
            try {
                const cached = await redisClient.get(
                    `${CACHE_PREFIX}${guildId}`,
                )
                if (cached) return JSON.parse(cached)
            } catch (err) {
                errorLog({ message: 'AutoMod cache read error', error: err })
            }
        }

        const settings = await prisma.autoModSettings.findUnique({
            where: { guildId },
        })

        if (settings && redisClient.isHealthy()) {
            redisClient
                .setex(
                    `${CACHE_PREFIX}${guildId}`,
                    CACHE_TTL,
                    JSON.stringify(settings),
                )
                .catch(() => {})
        }

        return settings
    }

    private invalidateCache(guildId: string): void {
        if (redisClient.isHealthy()) {
            redisClient.del(`${CACHE_PREFIX}${guildId}`).catch(() => {})
        }
    }

    async createSettings(guildId: string): Promise<AutoModSettings> {
        const result = await prisma.autoModSettings.create({
            data: { guildId },
        })
        this.invalidateCache(guildId)
        return result
    }

    async updateSettings(
        guildId: string,
        settings: Partial<
            Omit<AutoModSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
        >,
    ): Promise<AutoModSettings> {
        const result = await prisma.autoModSettings.upsert({
            where: { guildId },
            create: { guildId, ...settings },
            update: settings,
        })
        this.invalidateCache(guildId)
        return result
    }

    async checkSpam(
        guildId: string,
        _userId: string,
        messageTimestamps: number[],
    ): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.spamEnabled) return false

        const now = Date.now()
        const windowMs = settings.spamTimeWindow * 1000
        const recentMessages = messageTimestamps.filter(
            (ts) => now - ts < windowMs,
        )

        return recentMessages.length >= settings.spamThreshold
    }

    async checkCaps(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.capsEnabled) return false
        if (content.length < 10) return false

        const uppercaseCount = (content.match(/[A-Z]/g) || []).length
        const letterCount = (content.match(/[A-Za-z]/g) || []).length

        if (letterCount === 0) return false

        const capsPercentage = (uppercaseCount / letterCount) * 100
        return capsPercentage >= settings.capsThreshold
    }

    async checkLinks(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.linksEnabled) return false

        const urlRegex = /(https?:\/\/[^\s]+)/gi
        const urls = content.match(urlRegex)

        if (!urls) return false

        return urls.some(
            (url) =>
                !settings.allowedDomains.some((domain) => url.includes(domain)),
        )
    }

    async checkInvites(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.invitesEnabled) return false

        const inviteRegex =
            /discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+/gi
        return inviteRegex.test(content)
    }

    async checkWords(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.wordsEnabled) return false
        if (settings.bannedWords.length === 0) return false

        const lowerContent = content.toLowerCase()
        return settings.bannedWords.some((word) =>
            lowerContent.includes(word.toLowerCase()),
        )
    }

    isExempt(
        settings: AutoModSettings,
        channelId?: string,
        roleIds?: string[],
    ): boolean {
        if (channelId && settings.exemptChannels.includes(channelId)) {
            return true
        }

        if (
            roleIds &&
            roleIds.some((roleId) => settings.exemptRoles.includes(roleId))
        ) {
            return true
        }

        return false
    }
}

export const autoModService = new AutoModService()
