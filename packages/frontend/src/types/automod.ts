export type AutoModAction = 'warn' | 'mute' | 'kick' | 'ban'

export interface AutoModSettings {
    id: string
    guildId: string
    spamEnabled: boolean
    spamThreshold: number
    spamInterval: number
    spamAction: AutoModAction
    capsEnabled: boolean
    capsThreshold: number
    capsMinLength: number
    capsAction: AutoModAction
    linksEnabled: boolean
    linksWhitelist: string[]
    linksAction: AutoModAction
    invitesEnabled: boolean
    invitesAllowOwnServer: boolean
    invitesAction: AutoModAction
    wordsEnabled: boolean
    wordsList: string[]
    wordsAction: AutoModAction
    raidEnabled: boolean
    raidJoinThreshold: number
    raidTimeframe: number
    exemptChannels: string[]
    exemptRoles: string[]
}
