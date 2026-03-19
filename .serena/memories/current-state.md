# Lucky — Current State

**Updated**: 2026-03-18
**Latest release**: v2.6.37
**Main branch**: `c896374` (origin/main)

## Latest Releases
- **v2.6.37**: fixed PostgreSQL 18 persistence by setting `PGDATA=/var/lib/postgresql/data` in Docker compose (`#337`, `#340`).
- **v2.6.36**: restored play/autoplay reliability with yt-dlp format fallback and autoplay search fallback (`#338`, `#339`).

## Platform State
- Mainline CI checks green on latest release branch merges.
- Security audit gate clean after fast-xml-parser override uplift.
- Production release cadence recovered with small, focused PR flow.

## Active Worktrees
- `.worktrees/fix-319` remains locally with uncommitted frontend test work:
  - `packages/frontend/src/pages/AutoMessages.test.tsx` (modified)
  - `packages/frontend/src/services/autoMessagesApi.test.ts` (untracked)

## Open PRs / Issues
- Open PRs: none
- Open issues: not tracked in this memory snapshot (query GitHub before planning)

## Known Follow-up
- Decide whether to salvage or discard `.worktrees/fix-319` local test changes.
- Continue documentation/changelog hygiene passes to keep release metadata consistent.
