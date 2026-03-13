export const AUTOMATION_MODULES = [
    'onboarding',
    'roles',
    'moderation',
    'automessages',
    'reactionroles',
    'commandaccess',
    'parity',
] as const

export type AutomationModule = (typeof AUTOMATION_MODULES)[number]

export type AutomationAction = 'create' | 'update' | 'delete' | 'noop'

export type AutomationRunType =
    | 'capture'
    | 'plan'
    | 'apply'
    | 'reconcile'
    | 'cutover'

export type AutomationRunStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'blocked'

export type DriftSeverity = 'none' | 'low' | 'medium' | 'high'

export interface GuildAutomationRole {
    id: string
    name: string
    color?: number
    hoist?: boolean
    mentionable?: boolean
    permissions?: string
}

export interface GuildAutomationChannel {
    id: string
    name: string
    type: string
    parentId?: string | null
    topic?: string | null
    readonly?: boolean
}

export interface GuildAutomationOnboardingPromptOption {
    id?: string
    title: string
    description?: string | null
    channelIds?: string[]
    roleIds?: string[]
    emoji?: string | null
}

export interface GuildAutomationOnboardingPrompt {
    id?: string
    title: string
    singleSelect?: boolean
    required?: boolean
    inOnboarding?: boolean
    type?: number
    options: GuildAutomationOnboardingPromptOption[]
}

export interface GuildAutomationOnboarding {
    enabled: boolean
    mode: number
    defaultChannelIds: string[]
    prompts: GuildAutomationOnboardingPrompt[]
}

export interface GuildAutomationModeration {
    automod?: {
        exemptRoles?: string[]
        exemptChannels?: string[]
        [key: string]: unknown
    }
    moderationSettings?: {
        muteRoleId?: string | null
        modRoleIds?: string[]
        adminRoleIds?: string[]
        [key: string]: unknown
    }
}

export interface GuildAutomationAutoMessage {
    enabled?: boolean
    channelId?: string
    message?: string
}

export interface GuildAutomationReactionRoleMessage {
    id?: string
    messageId?: string
    channelId?: string
    title?: string
    description?: string
    mappings?: Array<{
        roleId: string
        label: string
        emoji?: string
        style?: string
    }>
}

export interface GuildAutomationParityChecklistItem {
    key: string
    label: string
    done: boolean
}

export interface GuildAutomationParity {
    shadowMode?: boolean
    externalBots?: Array<{
        id: string
        name: string
        retireOnCutover?: boolean
    }>
    checklist?: GuildAutomationParityChecklistItem[]
    cutoverReady?: boolean
}

export interface GuildAutomationManifestDocument {
    version: number
    guild: {
        id: string
        name?: string
    }
    onboarding?: GuildAutomationOnboarding
    roles?: {
        roles: GuildAutomationRole[]
        channels: GuildAutomationChannel[]
    }
    moderation?: GuildAutomationModeration
    automessages?: {
        welcome?: GuildAutomationAutoMessage
        leave?: GuildAutomationAutoMessage
    }
    reactionroles?: {
        messages?: GuildAutomationReactionRoleMessage[]
        exclusiveRoles?: Array<{
            roleId: string
            excludedRoleId: string
        }>
    }
    commandaccess?: {
        grants: Array<{
            roleId: string
            module:
                | 'overview'
                | 'settings'
                | 'moderation'
                | 'automation'
                | 'music'
                | 'integrations'
            mode: 'view' | 'manage'
        }>
    }
    parity?: GuildAutomationParity
    source?: 'discord-capture' | 'manual'
    capturedAt?: string
}

export interface GuildAutomationDiffOperation {
    module: AutomationModule
    action: AutomationAction
    target: string
    protected: boolean
    reason?: string
    desired?: unknown
    actual?: unknown
}

export interface GuildAutomationPlan {
    operations: GuildAutomationDiffOperation[]
    protectedOperations: GuildAutomationDiffOperation[]
    summary: {
        total: number
        safe: number
        protected: number
        byModule: Record<AutomationModule, number>
    }
}

export interface GuildAutomationStatus {
    manifest: {
        guildId: string
        version: number
        updatedAt: Date
        lastCapturedAt: Date | null
    } | null
    latestRun: {
        id: string
        type: string
        status: string
        createdAt: Date
    } | null
    drifts: Array<{
        module: string
        severity: string
        updatedAt: Date
    }>
}
