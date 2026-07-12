export * from './FeatureToggleService'
export * from './PremiumService'
export * from './database/DatabaseService.js'
export { afkService, type AfkStatusEntry } from './AfkService.js'
export {
    MusicControlService,
    musicControlService,
    type MusicCommand,
    type MusicCommandResult,
    type MusicCommandType,
    type RepeatMode,
    type QueueState,
    type TrackInfo as MusicTrackInfo,
} from './music/index.js'
export * from './LyricsService.js'
export * from './ModerationService.js'
export * from './moderationSettings.js'
export * from './AutoMessageService.js'
export * from './CustomCommandService.js'
export * from './ServerLogService.js'
export {
    AutoModService,
    AutoModTemplateNotFoundError,
    autoModService,
} from './AutoModService.js'
export * from './EmbedBuilderService.js'
export type { EmbedData, EmbedField } from './embedValidation.js'
export {
    hexToDecimal,
    decimalToHex,
    validateEmbedData,
} from './embedValidation.js'
export { twitchNotificationService } from './TwitchNotificationService'
export { TwitchControlService, twitchControlService } from './twitch/index.js'
export { twitchFollowerRoleService } from './TwitchFollowerRoleService'
export { twitchSubscriberRoleService } from './TwitchSubscriberRoleService'
export { lastFmLinkService, type LastFmLinkRow } from './LastFmLinkService'
export { spotifyLinkService, type SpotifyLinkRow } from './SpotifyLinkService'
export {
    trackHistoryService,
    type TrackHistoryEntry,
    type TrackHistoryInput,
    type TrackHistoryStats,
} from './TrackHistoryService'
export {
    guildSettingsService,
    type GuildSettings,
    type AutoplayCounter,
} from './GuildSettingsService'
export { roleManagementService } from './RoleManagementService'
export { reactionRolesService } from './ReactionRolesService'
export {
    guildAutomationManifestSchema,
    validateGuildAutomationManifest,
    type GuildAutomationManifestInput,
    createAutomationPlan,
    isPlanIdempotent,
    onboardingToManifest,
    manifestOnboardingToDiscordEdit,
    guildAutomationService,
    validateManifestOrThrow,
    parseManifestForDiff,
    createAutomationPlanWithDefaults,
    type GuildAutomationManifestDocument,
    AUTOMATION_MODULES,
    type AutomationModule,
    type AutomationAction,
    type AutomationRunType,
    type AutomationRunStatus,
    type DriftSeverity,
    type GuildAutomationPlan,
    type GuildAutomationDiffOperation,
    type GuildAutomationStatus,
    createAutoMessagesExecutor,
    type AutoMessagesLiveState,
    type AutoMessagesManifestSection,
    type AutoMessagesDiff,
    type AutoMessagesResult,
    type AutoMessagesPort,
} from './guildAutomation/index'
export {
    guildRoleAccessService,
    RBAC_MODULES,
    type ModuleKey,
    type AccessMode,
    type EffectiveAccess,
    type RoleGrant,
    type RoleGrantInput,
    type EffectiveAccessMap,
    GuildRoleGrantStorageError,
} from './GuildRoleAccessService'
export { redisClient } from './redis/index.js'
export {
    giveawayService,
    parseDuration,
    type GiveawayData,
} from './GiveawayService.js'
export {
    starboardService,
    type StarboardConfig,
    type StarboardEntry,
} from './StarboardService.js'
export {
    supportSessionService,
    SupportSessionService,
} from './SupportSessionService.js'
export {
    levelService,
    type LevelConfig,
    type MemberXP,
    type LevelReward,
    xpNeededForLevel,
} from './LevelService.js'
export { autoroleService, type AutoRoleEntry } from './AutoRoleService.js'
export {
    getPerSourceAcceptance,
    getSummary,
    type PerSourceRow,
    type Summary,
} from './recommendationTelemetryReadService'
export {
    SupportReportService,
    type SupportReport,
    type CreateReportInput,
    type ListReportsFilter,
} from './SupportReportService.js'

export {
    matchesScope,
    ProgressReporter,
    checkBatchPermissions,
    batchJobService,
    BatchJobService,
    type ScopeConfig,
    type BatchJobType,
    type BatchJobStatus,
    type BatchProgress,
    type BatchJobExecutor,
    type PermissionCheckResult,
} from './batch/index.js'

export {
    reminderService,
    ReminderService,
    MAX_DELIVERY_ATTEMPTS,
    type ReminderRecord,
    type ReminderTarget,
} from './ReminderService.js'
