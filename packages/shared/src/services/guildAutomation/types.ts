/** List of available guild automation modules. */
export const AUTOMATION_MODULES = [
    'onboarding',
    'roles',
    'moderation',
    'automessages',
    'reactionroles',
    'commandaccess',
    'parity',
] as const

/** Guild automation module type. */
export type AutomationModule = (typeof AUTOMATION_MODULES)[number]

/** Automation operation action types. */
export type AutomationAction = 'create' | 'update' | 'delete' | 'noop'

/** Automation run type (capture, plan, apply, etc). */
export type AutomationRunType =
    | 'capture'
    | 'plan'
    | 'apply'
    | 'reconcile'
    | 'cutover'

/** Automation run execution status. */
export type AutomationRunStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'blocked'

/** Drift severity level. */
export type DriftSeverity = 'none' | 'low' | 'medium' | 'high'

/** Guild role definition for automation. */
export interface GuildAutomationRole {
    id: string
    name: string
    color?: number
    hoist?: boolean
    mentionable?: boolean
    permissions?: string
}

/** Guild channel definition for automation. */
export interface GuildAutomationChannel {
    id: string
    name: string
    type: string
    parentId?: string | null
    topic?: string | null
    readonly?: boolean
}

/** Onboarding prompt option in guild automation. */
export interface GuildAutomationOnboardingPromptOption {
    id?: string
    title: string
    description?: string | null
    channelIds?: string[]
    roleIds?: string[]
    emoji?: string | null
}

/** Onboarding prompt in guild automation. */
export interface GuildAutomationOnboardingPrompt {
    id?: string
    title: string
    singleSelect?: boolean
    required?: boolean
    inOnboarding?: boolean
    type?: number
    options: GuildAutomationOnboardingPromptOption[]
}

/** Guild onboarding automation configuration. */
export interface GuildAutomationOnboarding {
    enabled: boolean
    mode: number
    defaultChannelIds: string[]
    prompts: GuildAutomationOnboardingPrompt[]
}

/** Guild moderation automation configuration. */
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

/** Guild automation message configuration. */
export interface GuildAutomationAutoMessage {
    enabled?: boolean
    channelId?: string
    message?: string
}

/** Guild automation reaction role message. */
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

/** Parity checklist item in guild automation. */
export interface GuildAutomationParityChecklistItem {
    key: string
    label: string
    done: boolean
}

/** Guild parity automation configuration. */
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

/** Guild automation manifest document (full schema). */
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

export type ExecutorOpError = {
    opIndex: number
    opKind: string
    reason: string
}

export type ExecutorApplyResult<TApplied> =
    | { status: 'success'; applied: TApplied }
    | { status: 'partial'; applied: TApplied; errors: ExecutorOpError[] }
    | { status: 'failed'; error: string }
