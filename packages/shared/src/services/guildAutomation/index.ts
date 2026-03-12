export {
    guildAutomationManifestSchema,
    validateGuildAutomationManifest,
    type GuildAutomationManifestInput,
} from './manifestSchema'
export {
    createAutomationPlan,
    isPlanIdempotent,
} from './diff'
export {
    onboardingToManifest,
    manifestOnboardingToDiscordEdit,
} from './onboardingMapper'
export {
    guildAutomationService,
    validateManifestOrThrow,
    parseManifestForDiff,
    createAutomationPlanWithDefaults,
    type GuildAutomationManifestDocument,
} from './service'
export {
    AUTOMATION_MODULES,
    type AutomationModule,
    type AutomationAction,
    type AutomationRunType,
    type AutomationRunStatus,
    type DriftSeverity,
    type GuildAutomationPlan,
    type GuildAutomationDiffOperation,
    type GuildAutomationStatus,
} from './types'
