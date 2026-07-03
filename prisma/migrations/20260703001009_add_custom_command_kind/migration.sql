-- Smart-command dispatch seam (ADR 2026-07-03): commandKind + per-kind config.
ALTER TABLE "custom_commands" ADD COLUMN "commandKind" TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE "custom_commands" ADD COLUMN "config" JSONB;
