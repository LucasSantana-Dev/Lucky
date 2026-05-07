# SigMap Query Context
Generated: 2026-05-03T02:47:48.234Z

## packages/shared/src/generated/prisma/models/GuildSubscription.ts
```
export interface GuildSubscriptionFieldRefs
export type GuildSubscriptionModel
export type AggregateGuildSubscription
export type GuildSubscriptionMinAggregateOutputType
export type GuildSubscriptionMaxAggregateOutputType
export type GuildSubscriptionCountAggregateOutputType
export type GuildSubscriptionMinAggregateInputType
export type GuildSubscriptionMaxAggregateInputType
export type GuildSubscriptionCountAggregateInputType
export type GetGuildSubscriptionAggregateType
export type GuildSubscriptionGroupByOutputType
export type GetGuildSubscriptionGroupByPayload
export type GuildSubscriptionWhereInput
export type GuildSubscriptionOrderByWithRelationInput
export type GuildSubscriptionWhereUniqueInput
export type GuildSubscriptionOrderByWithAggregationInput
export type GuildSubscriptionScalarWhereWithAggregatesInput
export type GuildSubscriptionCreateInput
export type GuildSubscriptionUncheckedCreateInput
export type GuildSubscriptionUpdateInput
```

## packages/shared/src/services/PremiumService.ts
```
export class PremiumService
async isPremium(guildId) → Promise<boolean>
async getSubscription(guildId) → Promise<GuildSubscri
```

## packages/frontend/src/hooks/useVoteStatus.ts
```
export interface VoteStatus
hasVoted: boolean streak: number nextVoteInSe
nextTier: { label: string
export function useVoteStatus() → { status }
```

## .worktrees/lucky-artists-fix/packages/shared/src/services/database/DatabaseInitializationService.ts
```
export interface DatabaseInitializationResult
export interface DatabaseServiceStatus
export class DatabaseInitializationService
async initialize() → Promise<boolean>
async getServiceStatus() → Promise<DatabaseServ
getDatabaseService() → DatabaseService | nu
async shutdown() → Promise<void>
```

## .worktrees/lucky-artists-fix/packages/shared/src/services/guildAutomation/types.ts
```
export interface GuildAutomationRole
export interface GuildAutomationChannel
export interface GuildAutomationOnboardingPromptOption
export interface GuildAutomationOnboardingPrompt
export interface GuildAutomationOnboarding
export interface GuildAutomationModeration
export interface GuildAutomationAutoMessage
export interface GuildAutomationReactionRoleMessage
export interface GuildAutomationParityChecklistItem
export interface GuildAutomationParity
export interface GuildAutomationManifestDocument
export interface GuildAutomationDiffOperation
export interface GuildAutomationPlan
export interface GuildAutomationStatus
export type AutomationModule
export type AutomationAction
export type AutomationRunType
export type AutomationRunStatus
export type DriftSeverity
```
