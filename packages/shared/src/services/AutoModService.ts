import { getPrismaClient } from '../utils/database/prismaClient.js'
import { redisClient } from './redis/index.js'
import { errorLog } from '../utils/general/log.js'

const prisma = getPrismaClient()
const CACHE_TTL = 300
const CACHE_PREFIX = 'automod:'

export interface AutoModSettings {
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
    linkExemptChannels: string[]
    invitesEnabled: boolean
    wordsEnabled: boolean
    bannedWords: string[]
    exemptRoles: string[]
    exemptChannels: string[]
    createdAt: Date
    updatedAt: Date
}

type AutoModMutableSettings = Omit<
    AutoModSettings,
    'id' | 'guildId' | 'createdAt' | 'updatedAt'
>

export interface AutoModTemplate {
    id: string
    name: string
    description: string
    settings: Partial<AutoModMutableSettings>
}

export class AutoModTemplateNotFoundError extends Error {
    readonly code = 'ERR_AUTOMOD_TEMPLATE_NOT_FOUND'

    constructor(templateId: string) {
        super(`Auto-mod template not found: ${templateId}`)
        this.name = 'AutoModTemplateNotFoundError'
    }
}

const AUTO_MOD_TEMPLATES: AutoModTemplate[] = [
    {
        id: 'balanced',
        name: 'Balanced',
        description:
            'Balanced baseline for PT-BR + EN communities with common scam and abuse protection.',
        settings: {
            enabled: true,
            spamEnabled: true,
            spamThreshold: 6,
            spamTimeWindow: 8,
            capsEnabled: true,
            capsThreshold: 75,
            linksEnabled: true,
            allowedDomains: [
                'youtube.com',
                'youtu.be',
                'twitch.tv',
                'discord.com',
                'github.com',
                'github.io',
                'vercel.app',
                'netlify.app',
                'render.com',
            ],
            invitesEnabled: true,
            wordsEnabled: true,
            bannedWords: [
                'nazi',
                'kkk',
                'discord nitro free',
                'steam free gift',
                'clonado',
                'vazado',
                'golpe',
                'malware',
                'phishing',
                'grabify',
            ],
        },
    },
    {
        id: 'strict',
        name: 'Strict Shield',
        description:
            'Aggressive anti-spam and anti-scam defaults for high-risk public servers.',
        settings: {
            enabled: true,
            spamEnabled: true,
            spamThreshold: 4,
            spamTimeWindow: 6,
            capsEnabled: true,
            capsThreshold: 65,
            linksEnabled: true,
            allowedDomains: ['youtube.com', 'youtu.be', 'discord.com'],
            invitesEnabled: true,
            wordsEnabled: true,
            bannedWords: [
                'discord free nitro',
                'gift card generator',
                'crypto giveaway',
                'onlyfans leak',
                'keylogger',
                'token logger',
                'rat trojan',
                'lifetime premium crack',
            ],
        },
    },
    {
        id: 'light',
        name: 'Light',
        description:
            'Lower-friction defaults with basic link and spam protection enabled.',
        settings: {
            enabled: true,
            spamEnabled: true,
            spamThreshold: 8,
            spamTimeWindow: 10,
            capsEnabled: false,
            linksEnabled: true,
            allowedDomains: [
                'youtube.com',
                'youtu.be',
                'twitch.tv',
                'discord.com',
                'github.com',
                'github.io',
                'vercel.app',
                'netlify.app',
                'render.com',
            ],
            invitesEnabled: true,
            wordsEnabled: false,
            bannedWords: [],
        },
    },
]

const normalizeForMatch = (value: string): string =>
    value
        .normalize('NFD')
        .replaceAll(/\p{M}+/gu, '')
        .toLowerCase()

const normalizeAllowedDomains = (domains: string[]): string[] =>
    domains
        .map((domain) => domain.trim().toLowerCase())
        .map((domain) => {
            if (!domain) return ''

            const candidate = domain.includes('://')
                ? domain
                : `https://${domain}`

            try {
                return new URL(candidate).hostname.toLowerCase()
            } catch {
                return domain.split(/[/:?#]/, 1)[0]?.toLowerCase() ?? ''
            }
        })
        .map((domain) => (domain.startsWith('www.') ? domain.slice(4) : domain))
        .filter((domain) => domain.length > 0)

const trimTrailingUrlPunctuation = (value: string): string => {
    let result = value.trim()
    const trailing = new Set([')', ',', '.', '!', '?', ';', ':'])

    while (result.length > 0 && trailing.has(result.at(-1) ?? '')) {
        result = result.slice(0, -1)
    }

    return result
}

const extractHostname = (rawUrl: string): string | null => {
    const sanitized = trimTrailingUrlPunctuation(rawUrl)

    try {
        const parsed = new URL(sanitized)
        return parsed.hostname.toLowerCase().replace(/^www\./, '')
    } catch {
        return null
    }
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
        settings: Partial<AutoModMutableSettings>,
    ): Promise<AutoModSettings> {
        const result = await prisma.autoModSettings.upsert({
            where: { guildId },
            create: { guildId, ...settings },
            update: settings,
        })
        this.invalidateCache(guildId)
        return result
    }

    async listTemplates(): Promise<AutoModTemplate[]> {
        return AUTO_MOD_TEMPLATES
    }

    async applyTemplate(
        guildId: string,
        templateId: string,
    ): Promise<{ settings: AutoModSettings; template: AutoModTemplate }> {
        const template = AUTO_MOD_TEMPLATES.find(
            (item) => item.id === templateId,
        )
        if (!template) {
            throw new AutoModTemplateNotFoundError(templateId)
        }

        const current =
            (await this.getSettings(guildId)) ??
            (await this.createSettings(guildId))
        const mergedAllowedDomains = [
            ...new Set([
                ...current.allowedDomains,
                ...(template.settings.allowedDomains ?? []),
            ]),
        ]
        const mergedBannedWords = [
            ...new Set([
                ...current.bannedWords,
                ...(template.settings.bannedWords ?? []),
            ]),
        ]

        const settings = await this.updateSettings(guildId, {
            ...template.settings,
            allowedDomains: mergedAllowedDomains,
            bannedWords: mergedBannedWords,
            exemptChannels: current.exemptChannels,
            exemptRoles: current.exemptRoles,
        })

        return { settings, template }
    }

    async trackMessageAndCheckSpam(
        guildId: string,
        userId: string,
    ): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.spamEnabled) return false

        if (!redisClient.isHealthy()) return false

        const now = Date.now()
        const windowMs = settings.spamTimeWindow * 1000
        const key = `spam:${guildId}:${userId}`

        await redisClient.lpush(key, String(now))
        await redisClient.ltrim(key, 0, settings.spamThreshold)
        await redisClient.expire(key, settings.spamTimeWindow + 1)

        const timestamps = await redisClient.lrange(key, 0, -1)
        const recentCount = timestamps.filter(
            (ts) => now - Number(ts) < windowMs,
        ).length

        return recentCount >= settings.spamThreshold
    }

    async checkSpam(
        guildId: string,
        userId: string,
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

    async checkLinks(
        guildId: string,
        content: string,
        channelId?: string,
    ): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.linksEnabled) return false

        if (channelId && settings.linkExemptChannels.includes(channelId)) {
            return false
        }

        const allowedDomains = normalizeAllowedDomains(settings.allowedDomains)
        if (allowedDomains.length === 0) return false

        const urlRegex = /(https?:\/\/[^\s]+)/gi
        const urls = content.match(urlRegex)

        if (!urls) return false

        return urls.some((url) => {
            const host = extractHostname(url)
            if (!host) return false

            return !allowedDomains.some(
                (domain) => host === domain || host.endsWith(`.${domain}`),
            )
        })
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

        const normalizedContent = normalizeForMatch(content)
        const contentTokens = normalizedContent
            .split(/[^\p{L}\p{N}_]+/u)
            .filter((token) => token.length > 0)

        return settings.bannedWords.some((word) => {
            const normalizedWord = normalizeForMatch(word.trim())
            if (!normalizedWord) return false

            if (normalizedWord.includes(' ')) {
                return normalizedContent.includes(normalizedWord)
            }

            return contentTokens.includes(normalizedWord)
        })
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
