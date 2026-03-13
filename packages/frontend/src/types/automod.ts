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

export interface AutoModTemplate {
    id: string
    name: string
    description: string
    settings: Partial<
        Omit<AutoModSettings, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
    >
}
