import { getPrismaClient } from '../utils/database/prismaClient.js'
import { typePrisma } from '../utils/database/prismaHelpers.js'

const prisma = typePrisma(getPrismaClient())

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
        return await prisma.autoModSettings.findUnique({
            where: { guildId },
        })
    }

    async createSettings(guildId: string): Promise<AutoModSettings> {
        return await prisma.autoModSettings.create({
            data: { guildId },
        })
    }

    async updateSettings(
        guildId: string,
        settings: Partial<
            Omit<AutoModSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
        >,
    ): Promise<AutoModSettings> {
        return await prisma.autoModSettings.upsert({
            where: { guildId },
            create: { guildId, ...settings },
            update: settings,
        })
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
