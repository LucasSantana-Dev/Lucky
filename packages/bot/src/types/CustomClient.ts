// CustomClient and CommandType now live in types/CommandData.ts alongside
// Command and ContextMenuCommand (they are mutually recursive; see the comment
// there and decisions/2026-05-16-next-refactor-target-bot-circular-deps.md).
// This file re-exports them so existing `types/CustomClient` import paths keep
// working. Declaring them again here would put a second contract behind those
// paths, free to drift from the canonical one.
export type { CustomClient, CommandType } from './CommandData'
