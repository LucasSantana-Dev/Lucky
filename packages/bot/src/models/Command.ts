// Command now lives in types/CommandData.ts alongside CustomClient and
// CommandData (they are mutually recursive; see the comment there and
// decisions/2026-05-16-next-refactor-target-bot-circular-deps.md). This
// file re-exports it so existing `models/Command` import paths keep
// working.
export { Command as default } from '../types/CommandData'
