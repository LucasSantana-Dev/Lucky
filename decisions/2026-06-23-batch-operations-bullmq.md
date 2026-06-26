# Batch / Bulk Operations: BullMQ In-Process Worker

- Status: accepted
- Date: 2026-06-23
- Method: /brainstorming → /deep-research (4-agent design workflow)

## Context

Lucky's commands are single-item (move-message, ban, kick, warn, purge…). Users need
**batch** variants — flagship: move _all_ (or filtered) messages from channel A → B.

The hard constraints (research):

- Discord has **no native "move message"** API. Move = re-post in destination + delete
  original. Today's move-message re-posts as a branded **embed** (author/avatar/timestamp
  in embed fields; attachments re-uploaded) then deletes the source — reactions/threads/pins
  are not preserved.
- `bulkDelete` only deletes messages **<14 days old, ≤100 per call**; older messages delete
  one-by-one under 10 req/10s per-route limits.
- A **5,000-message move ≈ 30–60 min and 10,000+ requests**. Discord's interaction lifetime
  after `deferReply` is **15 minutes** — so large jobs cannot complete inside a command reply.

Existing background infrastructure is for short, in-process work only: `setInterval`
schedulers (Birthday, ModDigest), Redis pub/sub for music control, and deferred-interaction
`editReply` progress. There is **no job queue, no job-persistence table, no resumability**.

## Decision

Build a reusable **batch-operation framework** on a Redis-backed **BullMQ** queue with an
**in-process worker**, plus persisted, resumable jobs.

1. **Queue + worker:** add `bullmq`; a `BatchQueue` enqueues jobs; a `BatchJobWorker` runs
   **inside the bot process**, started in `clientReady` alongside the existing schedulers, and
   reuses the **Redis instance the bot already runs**. No new container or deployment topology —
   the only deploy delta is the new dependency. (BullMQ's queue/worker split lets us extract the
   worker to its own process later if a single instance can't keep up — not needed now.)
2. **Persistence/resumability:** `BatchJob` + `BatchJobItem` Prisma tables. `nextCursor` is
   checkpointed **before** the destructive step so a crash/restart resumes with no duplicates;
   per-item rows give an audit trail and partial-failure reporting.
3. **Framework shape:** scope-select (all / count / user / date_range / contains) → **dry-run +
   confirmation gate** (item count, ETA, irreversibility, fidelity caveats) → enqueue → worker
   executes via a per-job-type `BatchJobExecutor` with rate-limit backoff and live progress
   (Redis pub/sub → dashboard; `editReply` for the command) → summary + `serverLog` audit.
4. **Executors** are pluggable: `ChannelMoveBatchExecutor` (reuses the already-exported
   `buildMoveEmbed`/`fetchAttachments`/`partitionAttachments`), then `BulkBan/Kick/Warn`, role,
   purge, etc. — all riding the same queue + job tables.

## Alternatives considered

- **Interaction-only + pause/resume (no queue):** ships fastest, no new dep, but large
  whole-channel moves require repeated manual `/batch-resume`, and there is no unattended
  completion or live dashboard. Rejected as the _target_ (kept as the in-interaction UX for
  small jobs); the queue supersedes it for anything that can exceed 15 min.
- **`setInterval` poller over a jobs table (no BullMQ):** avoids the dep but re-implements
  retries, backoff, concurrency limits, and failure handling that BullMQ already provides.
- **Separate worker container/process:** cleaner isolation, but unnecessary deployment weight
  for a single-instance homelab bot. The in-process worker can be promoted to a separate
  process later with no code change (same queue).

## Consequences

- New runtime dependency (`bullmq`) and a worker module started at bot ready; reuses existing
  Redis (graceful-degrade: if Redis is down, batch features disable, the bot runs).
- New Prisma tables + migration; new `@lucky/shared` `batch/` services; new bot commands and a
  backend `batchJobs` route + a frontend Batch Jobs dashboard page.
- Delivery is incremental: Phase 0 (this infra) + Phase 1 flagship `/bulk-move-messages` ship
  and prove the spine (gates green + staging) before the remaining batch commands fan out.
