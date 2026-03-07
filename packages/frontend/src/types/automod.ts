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
    invitesEnabled: boolean
    wordsEnabled: boolean
    bannedWords: string[]
    exemptRoles: string[]
    exemptChannels: string[]
    createdAt: Date
    updatedAt: Date
}
