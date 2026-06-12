import { getPrismaClient } from '../utils/database/prismaClient.js'

const prisma = getPrismaClient()
const CACHE_TTL = 300 // seconds

/** Auto-moderation settings configuration for a guild. */
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

// In-memory settings cache: key = guildId, value = { data, expiresAt (timestamp) }
const settingsCache = new Map<
    string,
    { data: AutoModSettings; expiresAt: number }
>()

// In-memory spam tracking: key = `${guildId}:${userId}`, value = sorted timestamp array
const spamWindows = new Map<string, number[]>()

/** Mutable subset of AutoModSettings excluding metadata fields. */
type AutoModMutableSettings = Omit<
    AutoModSettings,
    'id' | 'guildId' | 'createdAt' | 'updatedAt'
>

/** Pre-configured auto-moderation template. */
export interface AutoModTemplate {
    id: string
    name: string
    description: string
    settings: Partial<AutoModMutableSettings>
}

/** Error thrown when an auto-moderation template is not found. */
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

/** Normalizes text for case-insensitive matching by removing accents. */
const normalizeForMatch = (value: string): string =>
    value
        .normalize('NFD')
        .replaceAll(/\p{M}+/gu, '')
        .toLowerCase()

/** Normalizes and validates a list of allowed domains. */
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

/** Removes trailing punctuation from URLs. */
const trimTrailingUrlPunctuation = (value: string): string => {
    let result = value.trim()
    const trailing = new Set([')', ',', '.', '!', '?', ';', ':'])

    while (result.length > 0 && trailing.has(result.at(-1) ?? '')) {
        result = result.slice(0, -1)
    }

    return result
}

/** Extracts hostname from a URL string. */
const extractHostname = (rawUrl: string): string | null => {
    const sanitized = trimTrailingUrlPunctuation(rawUrl)

    try {
        const parsed = new URL(sanitized)
        return parsed.hostname.toLowerCase().replace(/^www\./, '')
    } catch {
        return null
    }
}

/** Provides auto-moderation checks and management for message content. */
export class AutoModService {
    /** Retrieves auto-mod settings for a guild with caching. */
    async getSettings(guildId: string): Promise<AutoModSettings | null> {
        // Check in-memory cache
        const cached = settingsCache.get(guildId)
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data
        }

        // Cache miss or expired; remove stale entry
        if (cached) {
            settingsCache.delete(guildId)
        }

        // Fetch from database
        const settings = await prisma.autoModSettings.findUnique({
            where: { guildId },
        })

        // Cache the result if found
        if (settings) {
            settingsCache.set(guildId, {
                data: settings,
                expiresAt: Date.now() + CACHE_TTL * 1000,
            })
        }

        return settings
    }

    /** Clears cached settings for a guild. */
    private invalidateCache(guildId: string): void {
        settingsCache.delete(guildId)
    }

    /** Creates default auto-mod settings for a guild. */
    async createSettings(guildId: string): Promise<AutoModSettings> {
        const result = await prisma.autoModSettings.create({
            data: { guildId },
        })
        this.invalidateCache(guildId)
        return result
    }

    /** Updates auto-mod settings for a guild. */
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

    /** Lists all available auto-mod templates. */
    async listTemplates(): Promise<AutoModTemplate[]> {
        return AUTO_MOD_TEMPLATES
    }

    /** Applies a pre-configured template to a guild's auto-mod settings. */
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

        // Get or create settings atomically via upsert
        const current = await this.updateSettings(guildId, {})
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

    /** Tracks a message and checks if spam threshold is exceeded. */
    async trackMessageAndCheckSpam(
        guildId: string,
        userId: string,
    ): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.spamEnabled) return false

        const now = Date.now()
        const windowMs = settings.spamTimeWindow * 1000
        const key = `${guildId}:${userId}`

        // Get existing timestamps or initialize empty array
        let timestamps = spamWindows.get(key) || []

        // Add current timestamp
        timestamps.push(now)

        // Filter out timestamps older than the window duration
        timestamps = timestamps.filter((ts) => now - ts <= windowMs)

        // Write back to map (only keep up to threshold + 1 for efficiency)
        spamWindows.set(key, timestamps.slice(-settings.spamThreshold - 1))

        return timestamps.length >= settings.spamThreshold
    }

    /** Checks if message timestamps exceed spam threshold. */
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

    /** Checks if message content exceeds caps lock threshold. */
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

    /** Checks if message contains disallowed links. */
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

    /** Checks if message contains Discord invite links. */
    async checkInvites(guildId: string, content: string): Promise<boolean> {
        const settings = await this.getSettings(guildId)
        if (!settings?.invitesEnabled) return false

        const inviteRegex =
            /discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+/gi
        return inviteRegex.test(content)
    }

    /** Checks if message contains banned words. */
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

    /** Checks if a channel or role is exempt from auto-mod checks. */
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

/** Resets spam windows for testing. */
export function _resetSpamWindows(): void {
    spamWindows.clear()
}

/** Resets settings cache for testing. */
export function _resetSettingsCache(): void {
    settingsCache.clear()
}

/** Singleton instance of AutoModService. */
export const autoModService = new AutoModService()
