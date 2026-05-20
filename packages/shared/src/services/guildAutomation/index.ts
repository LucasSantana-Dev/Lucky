export {
    guildAutomationManifestSchema,
    validateGuildAutomationManifest,
    type GuildAutomationManifestInput,
} from './manifestSchema'
export { createAutomationPlan, isPlanIdempotent } from './diff'
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
export {
    createAutoMessagesExecutor,
    type AutoMessagesPort,
    type AutoMessagesLiveState,
    type AutoMessagesManifestSection,
    type AutoMessagesDiff,
    type AutoMessagesDiffOp,
    type AutoMessagesResult,
    type ExecutorContext,
} from './autoMessagesExecutor'

// Module Executor pilot. See
// docs/decisions/2026-05-19-guild-automation-module-executors.md.
//
// Singleton built with the real autoMessageService. Orchestrators (backend
// GuildAutomationExecutionService, bot applyPlan.ts) consume this instead of
// running their own byte-identical upsertAutoMessage impls.
import { autoMessageService } from '../AutoMessageService.js'
import { createAutoMessagesExecutor } from './autoMessagesExecutor'
export const autoMessagesExecutor = createAutoMessagesExecutor({
    autoMessageService,
})
