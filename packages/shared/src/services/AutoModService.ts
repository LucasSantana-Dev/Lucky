import { getPrismaClient } from '../utils/database/prismaClient.js'

// Type assertion workaround for Prisma 6 + TS 5 compatibility
const prisma = getPrismaClient() as any

// Inline type definitions until Prisma type resolution is fixed
interface AutoModSettings {
    id: string
    guildId: string
    spamEnabled: boolean
    spamThreshold: number
    spamInterval: number
    spamAction: string
    capsEnabled: boolean
    capsThreshold: number
    capsMinLength: number
    capsAction: string
    linksEnabled: boolean
    linksWhitelist: string[]
    linksAction: string
    invitesEnabled: boolean
    invitesAllowOwnServer: boolean
    invitesAction: string
    wordsEnabled: boolean
    wordsList: string[]
    wordsAction: string
    raidEnabled: boolean
    raidJoinThreshold: number
    raidTimeframe: number
    exemptChannels: string[]
    exemptRoles: string[]
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
            data: {
                guildId,
                spamEnabled: false,
                spamThreshold: 5,
                spamInterval: 5000,
                spamAction: 'warn',
                capsEnabled: false,
                capsThreshold: 70,
                capsMinLength: 10,
                capsAction: 'warn',
                linksEnabled: false,
                linksWhitelist: [],
                linksAction: 'warn',
                invitesEnabled: false,
                invitesAllowOwnServer: true,
                invitesAction: 'warn',
                wordsEnabled: false,
                wordsList: [],
                wordsAction: 'warn',
                raidEnabled: false,
                raidJoinThreshold: 10,
                raidTimeframe: 10000,
                exemptChannels: [],
                exemptRoles: [],
            },
        })
    }

    async updateSettings(
        guildId: string,
        settings: Partial<Omit<AutoModSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>>,
    ): Promise<AutoModSettings> {
        return await prisma.autoModSettings.upsert({
            where: { guildId },
            create: {
                guildId,
                ...settings,
            },
            update: settings,
        })
    }

    async checkSpam(
        guildId: string,
        userId: string,
        messageTimestamps: number[],
    ): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.spamEnabled) return false

        const now = Date.now()
        const recentMessages = messageTimestamps.filter(
            (timestamp) => now - timestamp < settings.spamInterval,
        )

        return recentMessages.length >= settings.spamThreshold
    }

    async checkCaps(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.capsEnabled) return false
        if (content.length < settings.capsMinLength) return false

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

        // Check if any URL is not in whitelist
        return urls.some((url) => {
            return !settings.linksWhitelist.some((whitelisted) =>
                url.includes(whitelisted),
            )
        })
    }

    async checkInvites(
        guildId: string,
        content: string,
        currentGuildId?: string,
    ): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.invitesEnabled) return false

        const inviteRegex = /discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+/gi
        const invites = content.match(inviteRegex)

        if (!invites) return false

        // If allow own server is enabled and this is the current guild, allow
        if (settings.invitesAllowOwnServer && currentGuildId === guildId) {
            return false
        }

        return true
    }

    async checkWords(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.wordsEnabled) return false
        if (settings.wordsList.length === 0) return false

        const lowerContent = content.toLowerCase()
        return settings.wordsList.some((word) =>
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

        if (roleIds && roleIds.some((roleId) => settings.exemptRoles.includes(roleId))) {
            return true
        }

        return false
    }
}

export const autoModService = new AutoModService()
