# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Music watchdog** now detects orphaned voice sessions (bot disconnected but
  Redis session key still active) and automatically rejoins the voice channel
  and restores the queue from snapshot if the snapshot is ≤ 30 minutes old and
  at least one non-bot member is present. Configurable interval via
  `MUSIC_WATCHDOG_ORPHAN_INTERVAL_MS` (default 60 s) (#279).

## [2.6.20] - 2026-03-15

### Added

- `/queue rescue` now uses **probe-based URL validation** (`player.search` with
  configurable timeout, default 5 s) to detect actually unresolvable tracks
  (removed videos, geo-blocked content, dead links) in addition to the existing
  structural check. Configurable via `QUEUE_RESCUE_PROBE_TIMEOUT_MS` and
  `QUEUE_RESCUE_REFILL_THRESHOLD` env vars (#278).
- `/queue show` upcoming tracks list now appends an inline **recommendation
  reason tag** (e.g. `fresh artist rotation`, `similar title mood`) next to
  autoplay-sourced tracks, making the autoplay decision transparent at a glance (#275).
- **Now Playing** section in `/queue show` appends a `Recommended because:`
  line when the current track originated from autoplay (#275).

## [2.6.19] - 2026-03-15

### Added

- `/music health` now shows a **Recommendation feedback** field with the count
  of tracks the user has disliked, giving visibility into autoplay filtering
  state without leaving the health embed (#271).

### Changed

- Autoplay fallback selection now enforces configurable **artist diversity** (max
  2 tracks per artist, up from 1) and **source diversity** (max 3 tracks per
  source) caps via `selectDiverseCandidates`, preventing a single artist or
  platform from dominating the queue (#273).
- Same-source bonus in recommendation scoring replaced with a **same-source
  penalty** (−0.15), promoting cross-platform variety; different-source
  candidates are now preferred over same-source ones (#273).
- `RecommendationConfig` extended with `maxTracksPerArtist` (default 2) and
  `maxTracksPerSource` (default 3) fields for future tunability (#273).

### Fixed

- Deploy script now detects when running inside the webhook container and
  skips self-rebuild to prevent killing its own process, fixing the recurring
  Exited(0) webhook state after automated deploys (#274).
- Frontend Docker build no longer downloads yt-dlp binary during
  `npm install` — `YOUTUBE_DL_SKIP_DOWNLOAD=true` prevents rate-limit
  failures in CI (#272).
- Superseded the broken `nohup`-detached webhook restart approach from
  v2.6.18 with an early container-detection guard (#270, #274).

## [2.6.18] - 2026-03-15

### Added

- Startup session sweep (`restoreSessionsOnStartup`) — on `clientReady`, the
  bot scans Redis for `music:session:*` keys, rejoins the stored voice channel,
  and calls `restoreSnapshot` for each valid, fresh snapshot (≤ 30 min old).
  Stale snapshots are deleted. Per-guild errors are isolated so one failure
  does not abort the rest. Gated by `MUSIC_SESSION_RESTORE_ENABLED` (default
  enabled).
- Deploy-homelab skill (`.cursor/skills/deploy-homelab/SKILL.md`) with full
  architecture diagram, failure patterns, SSH commands, and container details.

### Changed

- Deploy webhook now uses async wrapper (`deploy-wrapper.sh`) that launches
  `deploy.sh` via `nohup` and returns HTTP 200 immediately, eliminating CI
  curl timeouts and LOCK_CONTENTION cascades (#258).
- Deploy workflow (`deploy.yml`) reduced `max_attempts` from 8 to 3 and
  adjusted `max-time` to 30s to match async response pattern (#258).
- Webhook hooks.json now mounts at `/hooks/hooks.json` instead of
  `/etc/webhook/hooks.json` to avoid the `almir/webhook` base image
  `VOLUME /etc/webhook` anonymous volume shadow (#262).
- Deploy script rebuilds the webhook container as the final step so
  hooks.json changes take effect on the next deploy cycle (#261).
- Replaced `-hotreload` with `-verbose` in webhook command since config
  is now baked into the image at build time (#261, #262).

### Fixed

- Fixed webhook VOLUME shadow where `almir/webhook` base image `VOLUME`
  directive created an anonymous volume that shadowed bind-mounted
  `hooks.json`, causing the container to use stale config (#261, #262).
- Fixed CI gate URLs in `lucky-ci-gate-recovery` and `lucky-deploy-recovery`
  skills (corrected domain from `lucky-api` to `lucky`) (#259).

## [2.6.17] - 2026-03-15

### Added

- `MusicSessionSnapshotService.deleteSnapshot()` — explicit Redis delete after a
  successful restore so the same snapshot is not re-applied on subsequent
  connections (double-restore prevention).

### Changed

- Session snapshot restore now prepends `currentTrack` to the restored queue so
  the track that was playing at crash/disconnect time is also recovered, not
  only upcoming tracks.
- `restoreSnapshot()` now enforces a configurable `maxAgeMs` staleness guard
  (default 30 minutes) and skips snapshots older than the threshold.
- `lifecycleHandlers.ts` now reads the session-restore gate from
  `ENVIRONMENT_CONFIG.MUSIC.SESSION_RESTORE_ENABLED` instead of raw
  `process.env`, aligning with the shared config source of truth.
- `MusicSessionSnapshotService` constructor now uses
  `ENVIRONMENT_CONFIG.SESSIONS.QUEUE_SESSION_TTL` as the default TTL so the
  `QUEUE_SESSION_TTL` env var is respected at the singleton level.
- Provider fallback ordering in search now sorts by health score so degraded
  providers are deprioritized before hitting their cooldown threshold, and
  on-cooldown providers are skipped entirely (`engineManager.ts`).
- `isAvailable()` now self-heals by clearing `cooldownUntil` in-place when the
  expiry timestamp has passed, so `/music health` no longer shows stale
  cooldown values for recovered providers.
- Deploy script (`scripts/deploy.sh`) now archives local drift state before
  origin sync via `git stash` with labeled stash, and enforces archive-reset
  checkout hygiene to prevent stale checkout artifacts.

### Fixed

- Restored executable bit on `scripts/deploy.sh` (PR #253 inadvertently changed
  mode from `100755` to `100644`), which caused the `almir/webhook` binary to
  return HTTP 500 with empty body on every deploy trigger.
- Made music watchdog recovery deterministic after disconnects by waiting for
  voice reconnection before replay attempts, recording recovery detail for
  failures/successes, and surfacing that detail in `/music health`.
- Deploy workflow now classifies failures into `LOCK_CONTENTION`,
  `CHECKOUT_RECOVERY_FAILED`, `MIGRATION_FAILED`, `RUNTIME_PRECHECK_FAILED`
  categories with hooks.json output capture for deterministic CI diagnosis.

## [2.6.16] - 2026-03-14

### Added

- Added deploy-recovery skill `.cursor/skills/lucky-deploy-recovery/SKILL.md`
  and linked it in `AGENTS.md` for "workflow green, production stale" incidents.
- Expanded project skills:
  - `.cursor/skills/lucky-docker-dev/SKILL.md` with deploy preflight, revision
    verification, and webhook signaling validation.
  - `.cursor/skills/lucky-ci-gate-recovery/SKILL.md` with webhook failure
    signatures (`dirty-tree-overwrite`, lock-collision, timeout-noise).
- Added `docs/AUTH_SMOKE_RUNBOOK.md` with manual Discord login smoke workflow
  and timestamped evidence capture template.

### Fixed

- Pinned webhook-driven `prisma migrate deploy` and `prisma migrate status`
  calls to `prisma/prisma.config.ts` so homelab deploys keep `DATABASE_URL`
  resolution when run from the webhook container.
- Updated GitHub MCP recovery docs and skills to use the official
  `github-mcp-server` binary with `gh auth token` as the primary runtime auth
  source and environment token fallback.
- Deploy webhook contract now includes command output in both success and error
  responses (`include-command-output-in-response*`) to prevent false-positive
  trigger results.
- Removed webhook runtime `-verbose` logging from compose service command to
  reduce request-secret exposure risk in logs.
- Hardened `scripts/deploy.sh` with:
  - required compose-env preflight before deploy actions
  - host-safe health endpoint resolution for non-container execution context
  - dirty tracked-worktree fail-fast before `git pull`
  - robust lock handling that validates stale/reused lock PIDs by command line

## [2.6.15] - 2026-03-14

### Added

- Added project CI triage skill
  `.cursor/skills/lucky-ci-gate-recovery/SKILL.md` and linked it in
  `AGENTS.md` for required-check/ruleset recovery workflows.
- Added project MCP GitHub recovery skill
  `.cursor/skills/mcp-github-recovery/SKILL.md` and linked it in `AGENTS.md`
  for `Transport closed` auth/transport remediation workflows.
- Expanded CI triage skill with deterministic required-vs-informational status
  classification and explicit ruleset-mismatch handling.
- Added repo-local OpenCode guardrail plugins, verification/install helper
  scripts, and the `opencode-lucky-workflows` project skill for Lucky Codex
  sessions on local and `server-do-luk`.
- Enhanced `/music health` diagnostics output for operator triage with resolver
  source/cache visibility, repeat-mode labels, watchdog recovery timestamps,
  and actionable recovery steps.

### Fixed

- Hardened GitHub MCP recovery runbook with protocol-compatibility detection
  (framed vs line-delimited stdio), wrapper-based runtime auth alignment for
  Codex, and local MCP config integrity checks for related server entries
  (`filesystem`, `fetch`, `playwright`).
- Bot music stability hotfix: `/autoplay` now acknowledges interactions before
  queue replenishment work, preventing Discord command timeout responses.
- Added fail-safe Discord Player error/debug handling (`player.events.on` and
  top-level `player.on`) so queue/player handler exceptions no longer crash the
  process during music runtime errors.
- Improved queue-miss guidance after runtime restarts: music commands now
  return explicit recovery text directing users to start a fresh queue with
  `/play`.
- SonarCloud CI is now Dependabot-safe: scans run only when `SONAR_TOKEN` is
  present, Dependabot PRs skip scan as success when token is unavailable, and
  non-Dependabot runs fail fast if the token is missing.
- Upgraded SonarCloud GitHub Action to `SonarSource/sonarqube-scan-action@v7`
  to keep workflow compatibility current.
- Cleared the open Dependabot workflow queue by landing split updates:
  `actions/checkout@v6`, `preactjs/compressed-size-action@v3`,
  `actions/labeler@v6`, and Sonar scan action `v7` via replacement PR.
- Deploy OAuth redirect smoke now treats sustained `429` rate-limit responses
  as warning-only (after auth-config contract passes), preventing false-negative
  homelab deploy failures caused by Discord OAuth endpoint throttling.
- Cleared the remaining moderate dependency audit chain by bumping
  `@swc/cli` to `^0.8.0`, raising `file-type` override to `>=21.3.2`,
  and forcing patched `yauzl` resolution (`3.2.1`), resulting in
  `npm audit` baseline `low=0`, `moderate=0`, `high=0`, `critical=0`.

## [2.6.14] - 2026-03-14

### Added

- Added Discord Discovery media pack assets to
  `assets/discord-discovery-media/2026-03/final` on `main` for stable
  `raw.githubusercontent.com` hosting
- Added centralized guild automation control plane for Criativaria with
  manifest persistence (`guild_automation_manifests`), run history
  (`guild_automation_runs`), and per-module drift snapshots
  (`guild_automation_drifts`)
- Added `/guildconfig` management command with `capture`, `plan`, `apply`,
  `reconcile`, `status`, and `cutover` subcommands for native-first server
  orchestration
- Added backend automation API routes under
  `/api/guilds/:guildId/automation/*` for manifest CRUD, run execution, status,
  and cutover operations

- Added `docs/BOT_COMMAND_ROADMAP_BENCHMARKS.md` with a benchmark-driven Lucky
  command roadmap (Dyno, Rythm, Loritta, MEE6, Carl-bot references), prioritized
  matrix, and a one-command-per-PR rollout plan for the next 6 weeks
- Frontend neo-editorial design foundation: semantic UI tokens in
  `packages/frontend/src/index.css` plus reusable primitives (`Shell`,
  `SectionHeader`, `EmptyState`, `StatTile`, `ActionPanel`) for consistent
  dashboard composition
- Added guild RBAC persistence model (`guild_role_grants`) and shared evaluator
  service with module keys (`overview`, `settings`, `moderation`, `automation`,
  `music`, `integrations`) plus `view`/`manage` modes
- Added backend RBAC and member-context endpoints:
  `GET/PUT /api/guilds/:guildId/rbac` and `GET /api/guilds/:id/me`
- Added frontend Access Control section in Server Settings to manage module
  grants by Discord role as full-policy replacement
- Added Auto-Mod template API routes:
  `GET /api/guilds/:guildId/automod/templates` and
  `POST /api/guilds/:guildId/automod/templates/:templateId/apply`
- Added public legal routes for Discord app metadata:
  `/terms-of-service`, `/privacy-policy` with aliases `/terms`, `/privacy`
- Added public install redirect endpoint (`/api/install`) and canonical install
  link (`https://lucky.lucassantana.tech/install`) for Discord app installation
- Added Discord Activities URL mapping policy for embedded app setup:
  root prefix `/` targets `lucky.lucassantana.tech` with no proxy path mappings
- `/serversetup` now supports `template:criativaria` with optional
  `mode:apply|dry-run`, including idempotent setup orchestration and dry-run
  summaries (PR #164)
- Added bot tests for command registration coverage, command-file filtering, and
  `/serversetup` template/mode behavior (`register.spec`,
  `getCommandsFromDirectory.spec`, `serversetup.spec`, `serversetupCriativaria.spec`) (PR #164)
- Added root verification scripts `npm run test:all` and `npm run verify` so
  local pre-PR validation matches the monorepo merge-risk surface instead of
  backend-only root test execution

### Fixed

- Security high/critical dependency remediation: pinned transitive overrides
  to `undici >=7.24.0` and `flatted >=3.4.0` to clear current high advisories;
  moderate findings remain tracked for a dedicated follow-up cycle.
- CI security audit gate now fails on high/critical findings (`npm run audit:high`)
  instead of non-blocking critical-only audit output, aligning workflow behavior
  with the repo security policy and recent remediation work
- GitGuardian incident hardening: removed hardcoded compose PostgreSQL password
  fallbacks, enforced secret-managed expected client-id checks in deploy OAuth
  smoke validation, and replaced secret-like literals in test/example fixtures
- Deploy workflow OAuth smoke now fails fast when
  `WEBAPP_EXPECTED_CLIENT_ID` is missing and reports explicit auth-config
  client-id mismatches.
- Bundle-size CI workflow now exports `YOUTUBE_DL_SKIP_DOWNLOAD=true` (with
  workflow token) so `youtube-dl-exec` postinstall no longer fails on anonymous
  GitHub API rate limits during `npm ci`
- Auto-mod template apply now writes Server Logs audit entries; guild fallback
  cache keys now use a non-reversible access-token fingerprint; Twitch and
  guild-selection frontend flows now include additional race guards and
  keyboard/screen-reader accessibility hardening
- Guild-access fallback caching now uses shared Redis keys instead of
  process-local memory, preserving fallback behavior across multi-instance
  backend deployments
- Sidebar server selector now exposes retry/re-auth recovery actions whenever
  guild loading fails (including stale-guild scenarios) and uses corrected menu
  accessibility semantics
- Auto-Mod template apply flow now uses a typed
  `AutoModTemplateNotFoundError` mapped to stable `404` route responses
- Dashboard auth/bootstrap now derives developer status directly from
  `/api/auth/status` (`user.isDeveloper`) and no longer calls developer-only
  `/api/toggles/global` for non-developer sessions; guild access lookups now
  dedupe concurrent Discord guild fetches and map guild-context dependency
  failures to explicit retryable `502` errors instead of opaque panel failures
- Server settings loading moved to explicit `/settings` page fetch flow with
  actionable retry/re-auth state on auth/network/upstream failures (instead of
  hidden background fetches during generic guild selection)
- Features dashboard loading now classifies fetch failures as
  `auth|forbidden|network|upstream` and exposes retry/re-auth actions instead
  of silent fallback when catalog/global/server toggle fetches fail
- Features bootstrap now defers catalog/global/server toggle requests until auth
  readiness confirms an authenticated session, preventing stale-hydration
  developer-toggle `403` probe noise
- OAuth callback resolution now keeps `WEBAPP_REDIRECT_URI` as canonical in
  production (no `WEBAPP_BACKEND_URL` override), restoring deploy OAuth smoke
  contract and frontend-host callback consistency.
- Local Prisma bootstrap now pins explicit config path
  (`--config prisma/prisma.config.ts`) across `db:*` scripts, and
  `db:migrate` now includes a guarded fallback for the known fresh-db legacy
  migration failure (`P3006` + missing `guilds`) without rewriting historical
  migration files (task `lucky-baseline-prisma-migrate-bootstrap-fix`)
- `db:generate` now applies a CI-safe fallback `DATABASE_URL` for Prisma client
  generation so build-only pipelines do not fail on missing database secrets
  (PR #188 follow-up)
- Bot workspace `type:check` and `build` commands now run deterministic
  preflight bootstrap (`db:generate` + `build:shared`) before bot compile
  steps, preventing clean-worktree failures from missing shared declaration
  outputs or stale Prisma generated types
- Removed stale frontend guild `/listing` client/store contract and aligned
  dashboard route expectations to canonical
  `/api/guilds/:guildId/automessages` (legacy
  `/api/guilds/:guildId/auto-messages` remains intentionally unmapped with
  `404`)
- Fixed Discord Discovery carousel URL stability by documenting canonical media
  URLs on `main` (instead of ephemeral feature branch refs that can return 404)
- Bot `/autoplay` command now resolves guild queue from player node cache when
  direct node lookup misses, preventing false `No music queue found` errors
  while a track is actively playing
- Bot `/autoplay` now acknowledges enable/disable responses before related-track
  replenishment and logs queue-resolution misses with diagnostics, preventing
  interaction timeout risk during provider/search latency
- Player error handling now hardens queue/player debug and error hooks with
  guarded logging and structured diagnostics so recovery attempts do not crash
  on unexpected payload shapes
- Dashboard guild listing now resolves bot membership through a backend Discord
  API fallback when the bot client cache is unavailable, restoring server
  visibility for split-process deployments
- Last.fm dashboard connect flow now respects configured API base/origin and
  callback state can be validated from cookie or query for split-origin setups
- Autoplay Last.fm scrobbling now falls back to stored requester metadata so
  recommended tracks keep the original requester attribution
- Last.fm connect callback URL generation now ignores invalid relative
  `WEBAPP_BACKEND_URL` values and falls back to the OAuth-derived absolute
  origin so production links always include an absolute callback URL
- Bot `/lastfm link` now prioritizes absolute `WEBAPP_BACKEND_URL` for connect
  URL host generation (fallback: `WEBAPP_REDIRECT_URI` origin), preventing
  stale legacy domains from appearing in user-facing link embeds (PR #163)
- Bot `/lastfm link` now rejects legacy `nexus.lucassantana.tech` and non-HTTP(S)
  origins during connect URL generation, preventing stale/bad origins from
  leaking into production link embeds when env values drift
- `/api/health/auth-config` now accepts forwarded request-origin fallback when
  `WEBAPP_BACKEND_URL` is unset, preventing false degraded deploy-gate failures
  while keeping OAuth callback path and origin validation active
- Deploy webhook rollout now fails fast when required runtime services
  (`backend`, `nginx`, `postgres`, `redis`) are missing/not running, and checks
  internal post-rollout readiness for `/api/health` and `/api/health/auth-config`
- Deploy GitHub workflow now classifies auth-config smoke failures as
  `upstream unavailable (5xx)` vs `contract invalid/unready (200 + bad body)`
  and prints counters in failure summaries for faster incident triage
- Deploy cloudflared restarts now use canonical `CLOUDFLARED_CONFIG_DIR`
  instead of `${HOME}` mount expansion, with preflight validation for
  `config-lucky.yml` and referenced credentials JSON before tunnel restart
  (PR #184)
- Deploy webhook rollout now starts target services with `--no-deps` and
  removes webhook from nginx startup dependencies, preventing deploy-trigger
  self-termination and upstream DNS resolution regressions during rollout
  (follow-up to PR #183)
- Deploy workflow webhook retries now normalize URL candidates and de-duplicate
  path retries, preventing malformed attempts like
  `/webhook/deploy/webhook/deploy` in failure loops
- Deploy webhook readiness probes now fall back to BusyBox `wget` when `curl`
  is unavailable inside the webhook container, preventing false timeout loops
  after healthy service rollout
- Deploy OAuth redirect smoke validation now derives expected `client_id` and
  `redirect_uri` from live `/api/health/auth-config` payload instead of a
  hardcoded host, preventing false-negative deploy failures during domain
  split-origin operation
- Guild list/dashboard metrics now return nullable live values from bot/API
  enrichment (no forced `0` fallback when metrics are unavailable)
- Sidebar profile identity now resolves as `nick > global_name > username`
  with secondary label `@username` (removed legacy `#0` discriminator behavior)
- Frontend shell now initializes guild selection on all authenticated routes,
  so the server selector is populated right after login instead of only after
  visiting pages that manually triggered guild loading (PR #162)
- Vercel deep links now use a final SPA fallback rewrite after `/api` and
  `/install`, and README now documents the complete Discord portal URL mapping
  (General Information, Installation, and Activities URL Mappings)
- `/install` now proxies to `/api/auth/discord` so the public install URL
  reliably returns Discord OAuth redirect (`302`) on production
- `/serversetup` now explicitly preserves managed server visual identity and
  does not modify guild icon/splash/banner (PR #164)
- Bot runtime command loading now includes `management`, `moderation`, and
  `automod` categories
- Command directory loading now ignores `*.spec.*` and `*.test.*` modules so
  test files are never registered as slash commands
- Management command category loader no longer overrides shared
  `excludePatterns`, preventing escaped-regex drift from importing `*.spec.*`
  files at runtime (task `lucky-baseline-bot-command-loader-runtime-warnings`)
- Dashboard guild authorization now tolerates per-guild context failures
  instead of dropping the full `/api/guilds` response when one guild fails
- Discord guild permission parsing now supports payload drift
  (`permissions`/`permissions_new`) and safely handles invalid permission values
- `/api/guilds` now maps recoverable Discord OAuth/scope/session failures to
  actionable auth responses (401/403) and maps upstream Discord outages to 502
- `GET /api/guilds/:id/me` no longer requires `overview` module access so the
  dashboard can always bootstrap member context for authorized users
- Admin guild authorization no longer depends on transient bot/member lookup
  network calls (`hasBotInGuild`/member context) during context resolution
- `GET /api/guilds/:id/me` no longer authorizes from cached guild membership
  during Discord upstream failures (`429`/`5xx`)
- RBAC storage failures caused by missing `guild_role_grants` now return
  explicit `503` responses (instead of silent empty grants or generic `500`)
- Production SPA fallback now excludes both `/api/*` and `/api` so API misses
  are handled by backend JSON error flow
- Twitch Notifications page now guards async fetch races, supports accessible
  Twitch URL/login input labeling, and resolves channel names in list rows
- Auto-Mod template apply endpoint now supports encoded template IDs in
  frontend client routes
- Server selector now distinguishes true empty authorization from
  fetch/auth/session failures, showing retry and re-auth actions for failure
  states instead of a misleading empty result
- Features route guard mapping is now consistent under the `automation` module
  across frontend route guards, sidebar module checks, and backend route guards
- `/servers` is now always accessible for authenticated users (not blocked by
  module RBAC guards), while server/module pages remain module-gated
- Guild auto-selection now picks the first server where Lucky is already added;
  when no server has Lucky installed, dashboard keeps no selected server and
  shows explicit selection guidance
- Dashboard guild selection no longer performs eager `/api/guilds/:id` and
  `/api/guilds/:id/listing` bootstrap requests, reducing duplicate upstream
  dependency calls during route navigation
- Frontend guild-fetch failures now preserve the current selected guild context
  to avoid abrupt resets across module pages during transient upstream errors
- Backend startup now verifies `guild_role_grants` relation availability before
  booting the web app and fails fast with a migration-required error when schema
  state is invalid
- Deploy/runtime DB guardrails now share the same required-relation verifier
  (`guild_role_grants`, `guild_automation_manifests`,
  `guild_automation_runs`, `guild_automation_drifts`) and deploy now enforces
  `prisma migrate status` pre-rollout, failing fast on migration/schema drift
  before restarting runtime services
- AutoMod web client now includes template listing/apply flows wired to
  `/api/guilds/:guildId/automod/templates` and
  `/api/guilds/:guildId/automod/templates/:templateId/apply`
- Refs: PR `#193`
- Refs: PR `#169`
- Guild automation API routes now map known precondition failures to actionable
  4xx responses instead of opaque 500s (`manifest missing`, `capture required`,
  `apply lock active`) (PR #171)
- Guild automation backend apply/reconcile endpoints now execute real Discord
  and DB mutations through a shared execution pipeline (capture -> plan ->
  protected-op gate -> execute -> persisted final status)
- `/api/guilds/:guildId/automation/apply` and `/reconcile` now return explicit
  infrastructure failures when the distributed lock backend is unavailable
  (fail-closed contract)
- Guild automation diff now marks permission-tightening updates as protected
  operations so `allowProtected` gating applies to destructive updates (PR #171)
- Guild cutover role cleanup now only mutates bots explicitly flagged
  `retireOnCutover: true`, preventing role removal from unrelated integrations
  (PR #171)
- Criativaria `/serversetup` now uses explicit upsert client typings for
  auto-message, embed template, and custom command operations, preventing
  stale shared declaration drift from breaking bot typecheck resolution.
- Sonar main-gate reliability/hotspot remediation hardens deterministic sorting,
  async error capture, keyboard-accessible progress controls, safer timer
  cleanup callbacks, bounded external-scrobbler now-playing parsing, and
  Node-native shared-export scanning (PR #186)

### Changed

- Standardized Lucky OpenCode sessions around repo-local policy/context/doc
  plugins, approved community add-ons (`opencode-shell-strategy`,
  `@tarquinen/opencode-dcp@latest`), and repo-local workflow commands
  (`/verify`, `/e2e`, `/db`).
- Documented the OpenCode config split, hard-block guardrails, remote attach
  flow, and the intentionally excluded heavy orchestration plugin set in
  `README.md`, `docs/MCP_SETUP.md`, and `AGENTS.md`.

- Bot command registration now loads moderation/automod/management command
  groups through the active register pipeline, so centralized management
  commands are consistently available after startup
- Removed unused legacy layout components (`DashboardLayout`, `Header`,
  `Navbar`) from frontend layout module to reduce duplicate shell patterns
- Frontend app shell (`Layout` + `Sidebar`) and login page now use the
  neo-editorial dark framing with improved active navigation states, clearer
  server selector affordances, stronger empty-state guidance, and mobile drawer
  parity
- Dashboard overview, servers page, and Last.fm page now use the shared
  neo-editorial primitives for denser status cards, clearer loading/empty/error
  states, and more consistent scan hierarchy
- Guild selector now shows authorized guilds directly (including admin-visible
  guilds without bot presence) and labels missing-bot guilds with an invite
  indicator
- Guild/module routes now use module-aware access middleware so read requests
  require `view` and mutating requests require `manage`
- Bot Jest config now maps relative `.js` imports to source modules during test
  execution, matching the ESM build import style
- Guild automation reconcile now uses ID-first matching with deterministic
  fallback for roles/channels and persists remapped manifest IDs for future
  convergent plans
- Shared guild automation lock flow now uses Redis token-based distributed locks
  (`SET NX PX` + safe token release) instead of in-memory instance-local locks
- Deploy webhook rollout now starts database dependencies first, runs
  `prisma migrate deploy`, and verifies `guild_role_grants` relation health
  before updating runtime services

## [2.6.13] - 2026-03-12

### Added

- Added `scripts/verify-shared-exports.mjs` to validate deep `@lucky/shared`
  service import paths used by backend startup.
- Added `scripts/homelab-diagnostics.sh` for sanitized deploy incident triage on
  `server-do-luk` (container state, backend logs, auth checks).

### Fixed

- Production backend crash-loop caused by `ERR_PACKAGE_PATH_NOT_EXPORTED` is
  fixed by exposing wildcard `@lucky/shared/services/*` subpath exports used by
  backend deep imports.

### Changed

- CI Quality Gates now verify shared deep exports after `build:shared` using
  `npm run verify:shared-exports` to prevent regressions before deploy.

### Verification

- `npm run build:shared`
- `node --input-type=module -e "import('@lucky/shared/services/guildAutomation/manifestSchema')"`
- `npm run type:check --workspace=packages/backend`
- `npm run test --workspace=packages/backend -- tests/integration/routes/guildAutomation.test.ts`

## [2.6.12] - 2026-03-12

### Fixed

- Guild automation apply/reconcile APIs now execute real Discord + DB mutations
  through the backend execution pipeline instead of record-only runs.
- Guild automation route error mapping now returns explicit responses for lock
  backend outages (503 fail-closed) and shared preconditions.
- Shared automation flow now uses typed guild-automation domain errors to keep
  route/service failure contracts deterministic.

### Changed

- Distributed execution lock is now Redis-backed with tokenized acquire/release
  semantics and safe-release verification.
- Reconcile convergence keeps ID-first matching with deterministic fallback and
  persists remapped manifest IDs for future convergent runs.
- Bot automation apply helpers were refactored to reduce complexity while
  preserving module behavior.

### Verification

- `npm run test --workspace=packages/backend -- tests/integration/routes/guildAutomation.test.ts`
- `npm run type:check --workspace=packages/backend`
- `npm run test --workspace=packages/bot -- src/functions/management/commands/guildconfig.spec.ts src/utils/guildAutomation/applyPlan.spec.ts src/utils/guildAutomation/captureGuildState.spec.ts`
- `CI/CD Pipeline` and `SonarCloud Scan` checks passed on PR #179.

## [2.6.11] - 2026-03-12

### Fixed

- Docker publish reliability in CI images: npm cache mounts are now isolated per
  stage with locked sharing, and `npm ci` failures are no longer masked by
  cache-verify fallback logic.
- Dashboard/server visibility stabilization from PR #169 is now on `main`,
  including resilient guild authorization handling, safer Discord permissions
  parsing, server selector error-state clarity, and authenticated `/servers`
  access.
- Backlog merge completion for PRs #163, #168, #164, and #169 in the same
  cycle.

### Changed

- OAuth callback policy for production docs is now explicitly frontend-host
  canonical (`https://lucky.lucassantana.tech/api/auth/callback`) for Discord
  portal alignment in this release cycle.

### Verification

- `docker build -f Dockerfile --target production-backend .`
- `docker build -f Dockerfile --target production-bot .`
- `docker build -f Dockerfile.frontend .`
- `npm run test --workspace=packages/backend -- tests/unit/services/DiscordOAuthService.test.ts tests/unit/services/GuildAccessService.test.ts`
- `npm run test --workspace=packages/frontend -- src/stores/guildStore.test.ts src/hooks/useGuildSelection.test.tsx src/App.authRoutes.test.tsx src/components/Layout/Sidebar.test.tsx src/pages/ServersPage.test.tsx src/pages/DashboardOverview.test.tsx`
- `CI=1 npm run test:e2e --workspace=packages/frontend -- tests/e2e/dashboard-page.spec.ts tests/e2e/servers-page.spec.ts tests/e2e/layout-navigation.spec.ts`
- `npm run lint --workspace=packages/frontend`
- `npm run type:check --workspace=packages/frontend`

## [2.6.10] - 2026-03-11

### Fixed

- OAuth/dashboard stabilization for split frontend/API origins with canonical
  callback handling and stronger auth config health diagnostics.
- Dashboard and shell data reliability across routes: selected guild re-sync,
  RBAC-aware quick actions/nav behavior, and member context availability for
  authorized module users.
- Sidebar identity rendering now consistently resolves as
  `nick > globalName > username` with `@username` secondary label.
- Cross-page E2E contract mismatches in redesigned shell pages
  (automod, features, servers, music, twitch, track-history, visual baselines).

### Changed

- Route/module policy alignment keeps `/features` under the `automation` access
  module and preserves deny-by-default RBAC behavior.
- Updated Playwright visual baselines for servers, dashboard, features, sidebar,
  loading, and error states.

### Security

- Removed Deezer support from music source unions and web import surfaces
  (`discord-player-deezer` removed).
- Replaced optional native Opus path with `opusscript` runtime dependency.
- Tightened dependency overrides to patched ranges:
  `tar>=7.5.11`, `hono>=4.12.7`, `file-type>=21.3.1`.

### Verification

- `npm run lint`
- `npm run type:check`
- `npm run build`
- `npm run test --workspace=packages/backend`
- `npm run test --workspace=packages/bot -- --runInBand`
- `npm run test --workspace=packages/frontend`
- `npm run test:e2e --workspace=packages/frontend` (190 passed)
- `npm audit --audit-level=high` (0 vulnerabilities)

## [2.6.10] - 2026-03-11

### Fixed

- OAuth/dashboard stabilization for split frontend/API origins with canonical
  callback handling and stronger auth config health diagnostics.
- Dashboard and shell data reliability across routes: selected guild re-sync,
  RBAC-aware quick actions/nav behavior, and member context availability for
  authorized module users.
- Sidebar identity rendering now consistently resolves as
  `nick > globalName > username` with `@username` secondary label.
- Cross-page E2E contract mismatches in redesigned shell pages
  (automod, features, servers, music, twitch, track-history, visual baselines).

### Changed

- Route/module policy alignment keeps `/features` under the `automation` access
  module and preserves deny-by-default RBAC behavior.
- Updated Playwright visual baselines for servers, dashboard, features, sidebar,
  loading, and error states.

### Security

- Removed Deezer support from music source unions and web import surfaces
  (`discord-player-deezer` removed).
- Replaced optional native Opus path with `opusscript` runtime dependency.
- Tightened dependency overrides to patched ranges:
  `tar>=7.5.11`, `hono>=4.12.7`, `file-type>=21.3.1`.

### Verification

- `npm run lint`
- `npm run type:check`
- `npm run build`
- `npm run test --workspace=packages/backend`
- `npm run test --workspace=packages/bot -- --runInBand`
- `npm run test --workspace=packages/frontend`
- `npm run test:e2e --workspace=packages/frontend` (190 passed)
- `npm audit --audit-level=high` (0 vulnerabilities)

## [2.6.9] - 2026-03-10

### Fixed

- Deploy workflow OAuth smoke gates now retry contract validation during rollout
  (auth-config and `/api/auth/discord`) instead of failing immediately when
  checking a still-updating backend
- Auth config health now marks `degraded` when `CLIENT_ID` differs from the
  expected production app id (`WEBAPP_EXPECTED_CLIENT_ID`, with production
  fallback) to detect Discord OAuth credential drift

## [2.6.8] - 2026-03-10

### Fixed

- Auth config health response now includes non-secret OAuth diagnostics
  (`auth.clientId`, `auth.authorizeUrlPreview`) and marks `degraded` when the
  OAuth redirect origin does not match configured frontend origins
- Deploy workflow now enforces OAuth redirect contract validation on
  `/api/auth/discord` (HTTP 302, expected Discord `client_id`, expected
  `redirect_uri`) before treating deploy as successful

## [2.6.7] - 2026-03-10

### Fixed

- Deploy webhook script now pins `COMPOSE_PROJECT_NAME=lucky` and auto-resolves
  the live compose working directory so webhook rollouts executed from `/repo`
  target the existing stack instead of failing on container-name conflicts
- Webhook service now runs deploy commands from `/home/luk-server/Lucky` so
  compose metadata matches the homelab stack and avoids container recreation
  conflicts during webhook-driven deploys
- Deploy lock handling now recovers stale `/tmp/lucky-deploy.lock` directories
  (PID-aware) after interrupted deploys instead of blocking all future runs
- Backend startup now attempts to connect the shared Redis client before serving
  requests, while continuing with fallback behavior if Redis is unavailable
- Deploy workflow auth smoke gate now strictly requires
  `/api/health/auth-config` with `status=ok`, no warnings, and healthy
  auth-session/Redis flags (no fallback to generic health endpoint)
- Backend route handlers now use schema-typed request parsing and explicit auth
  user-id guards (removed unsafe `any` request/body/query reads and non-null
  assertions across management, moderation, music, toggles, and twitch routes)
- Session middleware now uses typed `session-file-store` import wiring and
  strict `connect-redis` adapter wiring without unsafe casts

### Added

- New auth readiness endpoint: `GET /api/health/auth-config` returning
  `status`, auth/runtime flags, and deploy-safe warnings for OAuth/session
  validation

### Changed

- Backend lint no longer uses scoped ignore guardrails; strict lint now runs
  across the full backend package by default (issue #136 closure)
- Repository hygiene now ignores local Vercel environment artifacts
  (`.env.vercel.*`) and removes merged stale branches conservatively (merged
  local + merged remote only)

## [2.6.6] - 2026-03-10

### Added

- Lucky branding artifacts in `packages/frontend/branding`:
  `DESIGN_SYSTEM.md` and `BRANDING_GUIDE.md`
- Lucky logo and favicon runtime assets in `packages/frontend/public`
- Bot presence rotation module with richer profile-facing activities and live runtime stats

### Fixed

- Frontend lint now uses ESLint flat config (`packages/frontend/eslint.config.js`) so TypeScript/TSX parsing works correctly with ESLint 10
- CI quality gates now run package-level lint commands for frontend and backend, matching local verification workflow
- OAuth authorize/callback now resolves callback URI with same-origin precedence (`session` -> `WEBAPP_REDIRECT_URI` -> forwarded host), preventing split-session landing loops
- Added `/auth/callback` compatibility alias and callback-path normalization so legacy `/auth/callback` values still resolve to `/api/auth/callback`
- Backend server now enables `trust proxy` in production so secure session cookies are correctly issued behind nginx/Cloudflare
- Backend CORS now accepts configured origins plus `*.lucassantana.tech` and `*.luk-homeserver.com.br` hosts for dashboard/API split-domain setups
- Backend auth/Last.fm redirect targets now use the primary frontend origin when `WEBAPP_FRONTEND_URL` contains multiple comma-separated domains
- Backend OAuth session persistence now uses a connect-redis v9 compatibility adapter for ioredis clients, preventing callback save failures
- Frontend API inference now uses same-origin `/api` for `*.lucassantana.tech` to keep OAuth/session requests on one browser origin
- Nginx now normalizes `X-Forwarded-Proto` from edge headers (defaulting to `https`) so secure dashboard session cookies are emitted behind Cloudflare Tunnel
- Deploy smoke check now falls back to `/api/health` when `/api/health/auth-config` is unavailable
- Vercel routing no longer rewrites `/api/*` back to the same Lucky host, preventing `508 INFINITE_LOOP` on OAuth login
- Frontend API base URL now supports `VITE_API_BASE_URL` for hosted deployments that use a separate backend origin
- Vercel now forwards `/api/*` directly to `https://lucky-api.lucassantana.tech/api/*` to prevent frontend-host `404 NOT_FOUND` on OAuth/API routes
- Deploy webhook trigger now uses strict curl connect/request timeouts to avoid long hangs in CI deploy jobs
- Deploy webhook trigger now retries longer on 5xx/network failures, logs every attempt, and falls back to canonical `/webhook/deploy` path for all non-2xx responses
- Music now-playing updates no longer send extra plain-text messages on every track change
- Music now-playing embeds now reuse one message per guild channel to reduce chat spam
- Music now-playing footer/requested fields now use plain text formatting in Discord footers
- Last.fm scrobbling now records the finished/skipped track explicitly from player events
- Last.fm connect route now supports authenticated dashboard flow without requiring query `state`
- Autoplay queue replenishment now searches and enqueues a related track when queue is empty
- Deploy workflow now retries webhook calls with `/webhook/deploy` after HTTP 405
- Deploy script now restarts Cloudflare tunnel (`cloudflared`) during rollout
- Deploy script now prevents concurrent runs with a lock to avoid overlapping container rollouts
- Deploy script now falls back to restarting `lucky-tunnel` directly when compose profile restart is unavailable
- Frontend theming now maps legacy `lucky-*` classes to the Lucky purple/gold palette
- Frontend typography now uses Lucky type tokens (`Sora`, `Manrope`, `JetBrains Mono`) instead of the old default stack
- Vercel build now generates Prisma client before shared/frontend builds to prevent missing generated client errors
- OAuth callback now reuses the same redirect URI across auth start/callback token exchange, with forwarded-host fallback for proxied HTTPS deployments
- E2E stability improvements: dashboard/servers/track-history tests now use deterministic locators and route-delay handling
- Autoplay no longer keeps cycling the same recommendations; queue top-up now uses anti-repeat filtering and keeps a 4-track buffer
- Shuffle now works reliably while autoplay is enabled because autoplay maintains enough upcoming tracks
- Web music repeat mode now supports `autoplay` end-to-end (bot mapper, backend validation, shared/frontend types)

### Changed

- Backend lint scripts now include scoped guardrails for legacy strict-rule debt files and expose `npm run lint:full --workspace=packages/backend` for full debt tracking (follow-up: #136)
- Added `WEBAPP_BACKEND_URL` env propagation in Docker compose stacks and updated OAuth setup docs/examples to use same-origin callback URLs in production
- Added root npm deploy shortcuts: `npm run deploy:remote` and `npm run deploy:homelab`
- `scripts/deploy-remote.sh` now targets workflow file `deploy.yml` and waits for the dispatch run more reliably
- `scripts/deploy-remote.sh` now always prints failed GitHub Actions logs before exiting
- Added typography specification to Lucky brand docs (`DESIGN_SYSTEM.md` and `BRANDING_GUIDE.md`)
- Updated Lucky design/branding docs to define purple (`#8b5cf6`) and gold (`#d4a017`) as main brand colors with usage roles
- Added Lucky production tunnel snippet and `nexus` -> `lucky` zero-downtime migration checklist to Cloudflare/deploy docs
- Pinned Node engine to `22.x` to avoid unexpected major-version upgrades in CI/Vercel builds

## [2.5.0] - 2026-03-08

### Added

- Last.fm integration page with account linking, status display, and unlink flow
- Last.fm external scrobbler for Discord music bot playback
- Drag-and-drop queue reordering in music player UI
- Redis cache metrics and health endpoint (`/api/health/cache`)
- Last.fm OAuth connect/callback routes with HMAC-signed state
- Backend integration tests for Last.fm routes (22 tests) and health routes (5 tests)
- Frontend unit tests for Last.fm page covering all states
- E2E specs for 8 previously untested pages (33 tests)
- Twitch feature toggle enforcement and user lookup API
- SonarCloud quality gate integration (0 issues on first scan)

### Fixed

- Docker builds: include all workspace package.jsons for correct npm hoisting
- Last.fm OAuth: validate API key before redirect, use `WEBAPP_BACKEND_URL` for callback
- SonarCloud org key and project configuration
- CI build order: `build:shared` runs before lint/type-check
- Code quality: reduced cognitive complexity in `cleanupOldData()`, extracted `scrobbleAndRecord()`
- Bounded in-memory maps (`lastPlayedTracks`, `recentlyPlayedTracks`) to 500 entries

### Changed

- Upgraded SonarCloud action from v5 to v6
- Structured logging across bot handlers (replaced `console.*` calls)
- PR automation: labeler, size tracking, auto-merge for dependabot, bundle size checks

## [2.4.0] - 2026-03-08

### Fixed

- YouTube audio streaming — pipe yt-dlp stdout as Readable stream instead of expiring URLs
- Docker workspace builds run from root for correct resolution
- Webhook excluded from deploy rebuilds to preserve logs
- Shared package exports map includes types condition

### Changed

- Renamed remaining LukBot references to Lucky (Docker images, Cursor rules, env vars)
- YouTube extractor uses IOS client with 32MB buffer for stable playback

## [2.3.0] - 2026-03-08

### Added

- Lyrics search frontend page with song title and artist lookup
- Track history frontend page with play stats, top artists/tracks rankings
- Twitch notifications frontend page with add/remove streamer management
- Redis caching for hot-path services (guild settings, feature toggles)
- E2E Playwright tests for Lyrics, Track History, and Twitch pages (22 new tests)
- Frontend unit tests for 13 new pages (197 total, 23 suites)

### Fixed

- Music player NoResultError — upgraded discord-player-youtubei to v2.0.0-dev.2
- YouTube extractor switched from ANDROID to WEB client for reliability
- Bot startup and play command loader refactored for stability
- Docker build: added legacy-peer-deps for ESLint compat, Python3 for deps-production
- Express 5 wildcard routes and dynamic import path resolution
- Backend healthcheck uses API endpoint instead of root path
- Cloudflare tunnel uses config file instead of remote token
- Prisma 7 DATABASE_URL handling via prisma.config.ts

### Changed

- Docker multi-stage build optimized with separate base-runtime stages
- Regenerated package-lock.json for Docker build compatibility

## [2.2.0] - 2026-03-07

### Added

- Track history API routes (GET history, stats, top tracks/artists, DELETE clear)
- Twitch notification API routes (GET list, POST add, DELETE remove)
- Lyrics search API route (GET `/api/lyrics?title=...&artist=...`)
- Reaction roles and exclusive roles read-only API routes
- 21 integration tests for new route files (4 test suites)

### Changed

- Replaced manual type casts with Prisma generated types in TwitchNotificationService, LastFmLinkService, EmbedBuilderService, ReactionRolesService, RoleManagementService
- Removed `as unknown as` casts and manual model wrappers — services now use `getPrismaClient()` directly

## [2.1.0] - 2026-03-07

### Fixed

- Removed `typePrisma()` workaround from all 6 services — now use fully-typed generated PrismaClient
- Added 10 missing fields to Prisma schema (appealedAt, modRoleIds, adminRoleIds, embedData, trigger, exactMatch, description, lastUsed, action)
- Fixed JsonValue/null type mismatches in memberHandler and messageHandler
- Fixed Docker multi-stage build Prisma path and backend ESM output
- Fixed Express 5 read-only `req.params` in validateParams middleware
- Fixed Dockerfile workspace hoisting with single deps stage

### Added

- Guild settings API routes (GET/POST `/api/guilds/:guildId/settings`)
- Module settings API routes (GET/POST `/api/guilds/:guildId/modules/:slug/settings`)
- Jest mock for generated Prisma client (ESM import.meta compatibility)
- Prisma migration for 10 missing service fields
- 7 integration tests for guild settings routes

### Changed

- Backend test count: 361 → 368 tests (25 suites)
- Services import PrismaClient from generated path instead of `@prisma/client`
- `prismaHelpers.ts` (typePrisma/TypedPrisma) is now dead code

## [2.0.1] - 2026-03-07

### Fixed

- Fixed handler import paths for reactionrole, roleconfig, twitch commands
- Fixed reactionrole roles option description exceeding Discord's 100-char limit
- Fixed Prisma 7 client import path to use generated output directory
- Added missing unleash-client transitive dependencies (minipass chain)
- Mapped Redis to port 6380 in docker-compose.dev.yml (avoids Supabase conflict)
- Updated E2E visual regression snapshots after AutoMod UI changes

## [2.0.0] - 2026-03-07

### Fixed - AutoMod schema alignment

- Aligned AutoMod code across all 4 packages with actual Prisma schema
- Removed fields that never existed in DB: all `*Action` fields, `capsMinLength`, `raidEnabled`, `raidJoinThreshold`, `raidTimeframe`, `invitesAllowOwnServer`
- Renamed: `spamInterval` → `spamTimeWindow`, `linksWhitelist` → `allowedDomains`, `wordsList` → `bannedWords`
- Removed `ActionSelect` component and Raid Protection card from frontend
- Removed Prisma `$on` event handlers (removed in Prisma 7)

### Changed - Prisma 7 upgrade

- Upgraded Prisma from 6.19.2 to 7.4.2 (both CLI and client)
- Migrated to `@prisma/adapter-pg` driver adapter for direct TCP connections
- Updated schema generator: `prisma-client` provider with `engineType = "client"`
- Removed deprecated `url` from `datasource` block (now in `prisma.config.ts`)
- Zero npm vulnerabilities (added overrides for @smithy, @hono, lodash)

### Changed - GitHub repo rename

- Renamed GitHub repository from `LukBot` to `Lucky`
- Updated all remaining `LukBot` references in scripts, Dockerfile, and Cursor rules
- Renamed `.cursor/rules/lukbot-*.mdc` to `lucky-*.mdc`

### Added - Backend quality infrastructure

- Zod input validation middleware (`validateBody`, `validateParams`, `validateQuery`)
- Rate limiting (`apiLimiter` 100/min, `authLimiter` 20/15min, `writeLimiter` 30/min)
- `AppError` class with static factories for typed operational errors
- `asyncHandler` wrapper eliminating try/catch boilerplate in route handlers
- Centralized `errorHandler` middleware (AppError -> typed response, unknown -> 500)
- `ApiError` class in frontend preserving status code and validation details
- Request logging middleware (method, url, status, duration)

### Changed - Frontend API alignment

- Fixed HTTP method mismatches (POST -> PATCH for automod/moderation settings)
- Fixed path mismatches (moderation user cases, case update/deactivate)
- Aligned `logsApi` with backend routes (getRecent, getByType, search, getUserLogs)
- Axios interceptor now creates typed `ApiError` instead of generic `Error`
- Refactored 8 route files removing ~50 try/catch blocks (net -119 lines)
- Converted 15 music route try/catch blocks to `asyncHandler` + `AppError`
  (playbackRoutes 9, queueRoutes 5, stateRoutes 1)

### Added - Favicon

- Custom SVG bot favicon with Discord-inspired design (blurple #5865F2)
- Replaced default Vite favicon reference in `index.html`

### Fixed - Design token consistency

- Replaced emoji icons (☰, ⭐, ⚙) with Lucide icons in ServersPage tabs
- Fixed 30+ broken CSS class references across 17 component files:
  - `text-text-secondary` → `text-lucky-text-secondary`
  - `text-text-primary` → `text-white`
  - `bg-bg-tertiary/secondary/active/primary` → `bg-lucky-bg-*`
  - `border-bg-border` → `border-lucky-border`
- All pages and components now use consistent `lucky-*` design tokens

### Fixed - Auth redirect loop

- Added in-memory session fallback when Redis is unavailable in `SessionService`
- Sessions now use `Map<string, string>` when `redisClient.isHealthy()` returns false
- Fixed `.env` `REDIS_HOST=redis` (Docker service name) → `localhost` for local dev
- Auth flow no longer silently drops session data without Redis

### Added - AutoMod mute action and case tracking

- Implemented `mute` action in automod violation handler using Discord native timeout API
- Default automod mute duration: 5 minutes (300s)
- All automod violations now delete the offending message first
- `warn` action creates moderation case via ModerationService
- `kick` and `ban` actions now also create moderation cases (previously fire-and-forget)
- Bot user recorded as moderator with `[AutoMod]` reason prefix for audit trail

### Fixed - Express 5 type safety

- Added `p()` helper for `string | string[]` param extraction (Express 5 breaking change)
- Fixed `req.params` destructuring in management, moderation, embeds, auto-messages routes
- Fixed `return res.json()` → `res.json(); return` for asyncHandler void compatibility
- Fixed `p()` not applied to Zod-coerced number params (caseNumber) or optional query params
- Replaced `type as any` with `type as 'welcome' | 'leave'` in auto-messages

### Added - Test coverage improvements

- `LastFmAuthService` unit tests (11 tests, 0% -> 100% coverage)
- `AppError.forbidden()` default message branch test
- Coverage: statements 96%, branches 84%, functions 100%, lines 96%
  (362 tests across 24 suites)

### Added - Frontend unit testing infrastructure

- Vitest + React Testing Library + jsdom for frontend unit tests
- `ApiError` tests (7 tests — constructor, details, status helpers)
- `guildStore` Zustand tests (9 tests — fetch, select, update, error handling)
- `featuresStore` Zustand tests (9 tests — global/server toggles, defaults)
- `useServerFilter` hook tests (5 tests — filter all/with-bot/without-bot)
- 30 frontend tests across 4 suites, all passing

### Removed

- Unused `featuresApi.ts` (duplicated inline in `api.ts`)
- Phantom API endpoints with no backend routes (logs export, single log, clear)

### Added - Skills.sh ecosystem skills and Serena project memory

- **`.agent-skills/`**: 10 skills installed from skills.sh ecosystem — `systematic-debugging`, `test-driven-development`, `brainstorming`, `verification-before-completion`, `requesting-code-review` (obra/superpowers); `vercel-react-best-practices`, `web-design-guidelines` (vercel-labs/agent-skills); `nodejs-backend-patterns`, `typescript-advanced-types`, `database-migration` (wshobson/agents)
- **`.serena/memories/`**: 6 Serena project memory files — `project-overview.md`, `current-state.md`, `known-gotchas.md`, `next-priorities.md`, `db-and-services.md`, `agent-workflow.md`
- **`.cursor/hooks/session-context.sh`**: Updated to instruct agents to load Serena memories at session start
- **`AGENTS.md`**: Added "Session Start" protocol and "Ecosystem skills" table for `.agent-skills/` skills

### Fixed - EmbedBuilderService implementation (Phase 7 unblocked)

- Created `packages/shared/src/services/EmbedBuilderService.ts` with full CRUD for embed templates
- Created `packages/shared/src/services/embedValidation.ts` with `validateEmbedData`, `hexToDecimal`, `decimalToHex`
- Added `useCount Int @default(0)` to `EmbedTemplate` Prisma model
- Fixed `packages/bot/src/functions/management/commands/embed.ts` to build `EmbedBuilder` from individual schema fields instead of `embedData` blob
- Enabled embed API routes in `packages/backend/src/routes/managementEmbeds.ts`
- Fixed and re-enabled `packages/backend/tests/unit/services/EmbedBuilderService.test.ts`

### Changed - Doc governance cleanup

- Removed `STATUS.md`, `NEXT_STEPS.md`, `COMPLETION_SUMMARY.md` from root — content moved to `.serena/memories/`

### Added - Frontend Dashboard (Phases 1-5 Support)

- **Dashboard Overview** (`DashboardOverview.tsx`): Stats cards (members, active cases, total cases, auto-mod actions), recent moderation cases list, quick actions panel, case-type breakdown with animated progress bars
- **Moderation Cases** (`Moderation.tsx`): Full cases table with search/filter by type, pagination, case detail modal with status/timeline, color-coded action badges (warn/mute/kick/ban/unban/unmute)
- **Auto-Moderation Config** (`AutoMod.tsx`): Toggle cards for 6 filter types (spam, caps, links, invites, banned words, raid protection), per-filter action select, tag-list inputs for whitelist/wordlist, exemptions panel for channels/roles
- **Server Logs** (`ServerLogs.tsx`): Filterable log viewer with level badges (info/warn/error/moderation/automod/system), level summary chips, export functionality, pagination
- **Server Settings** (`ServerSettings.tsx`): Bot nickname, command prefix, timezone, updates channel, warnings toggle
- **Custom Commands** (`CustomCommands.tsx`): Commands grid with category chips, search, per-command enable/disable toggles
- **Auto Messages** (`AutoMessages.tsx`): Scheduled message cards with interval/channel/embed info, create/edit/delete actions
- **API Services**: `moderationApi.ts`, `automodApi.ts`, `logsApi.ts` with full CRUD operations
- **Routing**: All new pages registered in `App.tsx` with lazy loading and code splitting
- Sidebar already had all nav sections (Main, Moderation, Management, Extras) — now all routes are wired
- All pages are fully responsive (mobile sidebar drawer, stacked layouts, sticky save bars on mobile)
- Framer Motion animations for cards, lists, and page transitions
- Dark theme consistent with Lucky design system (custom CSS variables)

### Added - Moderation System Implementation

- Implemented 11 moderation commands:
  - Core actions: `/warn`, `/mute`, `/unmute`, `/kick`, `/ban`, `/unban`
  - Case management: `/case` (view/update/delete subcommands), `/cases` (list with filters), `/history` (user timeline)
- Created `ModerationService` with case management, settings, and statistics
- Created `AutoModService` with spam, caps, links, invites, and word filters
- Created `EmbedBuilderService` for embed template management
- Created `AutoMessageService` for welcome/leave/scheduled messages
- Created `CustomCommandService` for custom command management
- Created `ServerLogService` for server event logging
- Added backend API routes: `moderation.ts`, `management.ts`, `managementEmbeds.ts`, `managementAutoMessages.ts`
- Added unit tests for all 6 new services (ModerationService, AutoModService, EmbedBuilderService, AutoMessageService, CustomCommandService, ServerLogService)
- Added comprehensive documentation: `BOT_INTEGRATION_PLAN.md` with Phases 4-9 implementation roadmap

### Fixed - Prisma TypeScript ES Module Compatibility

- Resolved TypeScript compilation errors with Prisma client in ES module environment
- Changed Prisma generator from `prisma-client-js` to `prisma-client` with custom output path
- Generated Prisma client to `packages/shared/src/generated/prisma` (within project rootDir)
- Updated all imports from `@prisma/client` to use generated client location
- All 6 services now compile successfully without modifying `node_modules`
- Documented solution in `PRISMA_RESOLUTION_FINAL.md`

### Changed - Music Player Frontend Refactoring

- Rewrote `NowPlaying.tsx` with responsive layout, skeleton loading, lazy images, debounced volume, ARIA labels, and reduced motion support
- Extracted `PlaybackControls.tsx` with touch-friendly controls (min 44px hit targets), shuffle, repeat, and volume slider
- Rewrote `SearchBar.tsx` with `React.memo`, accessible form semantics, and responsive sizing
- Rewrote `ImportPlaylist.tsx` with `React.memo`, explicit Tailwind classes, and form accessibility
- Rewrote `QueueList.tsx` with `React.memo`, CSS containment, lazy images, show-more pattern, and ARIA roles
- Optimized `useMusicPlayer` hook with SSE reconnection (exponential backoff), optimistic UI updates, and connection status tracking
- Extracted `useMusicCommands` hook for command factory methods
- Created `useDebounce` hook for performance-sensitive inputs
- Updated `Music.tsx` page with connection badge, keyboard shortcuts (Space = play/pause), error display, and responsive header
- Renamed `TrackInfo` to `EmbedTrackInfo` in embed utilities to resolve duplicate export conflict with music service types
- Fixed duplicate import in `MusicControlService.ts`

### Refactored - Large File Splits (max-lines compliance)

- Split `DatabaseService.ts` (733→196 lines): extracted `database/models.ts`, `database/mappers.ts`, `database/analyticsOperations.ts`
- Split `ServerLogService.ts` (516→171 lines): extracted `serverLogHelpers.ts` for convenience logging methods
- Split `GuildSettingsService.ts` (321→123 lines): extracted `guildCounters.ts` for counter/rate-limit operations
- Split `api.ts` (295→95 lines): extracted `musicApi.ts` and `featuresApi.ts`
- Split `reactionrole.ts` (256→53 lines): extracted `reactionroleHandlers.ts` for subcommand handlers
- Split `eventsubClient.ts` (290→132 lines): extracted `eventsubSubscriptions.ts` for subscription/notification logic
- Split `management.ts` (369→158 lines): extracted `managementEmbeds.ts` and `managementAutoMessages.ts`
- Split `trackHandlers.ts` (335→115 lines): extracted `trackNowPlaying.ts` for embed/Last.fm logic
- Split `SimplifiedTelemetry.ts` (297→189 lines): extracted `healthChecks.ts` and `telemetryMetrics.ts`
- Split `ModerationService.ts` (279→121 lines): extracted `moderationSettings.ts` for settings management
- Split `DashboardLayout.tsx` (270→108 lines): extracted `DashboardSidebar.tsx` component
- Split `environment.ts` (257→191 lines): extracted `infisical.ts` for Infisical secrets loading
- Split `twitch.ts` (257→59 lines): extracted `twitchHandlers.ts` for subcommand handlers
- Split `ReactionRolesService` (261→177 lines): extracted `buttonHandler.ts` for button interaction handling
- Split `AutoModService.ts` (246→87 lines): extracted `autoModFilters.ts` for content filter checks
- Split `TrackHistoryService.ts` (243→185 lines): extracted `trackHistoryStats.ts` for stats/analytics
- Split `roleconfig.ts` (231→49 lines): extracted `roleconfigHandlers.ts` for subcommand handlers
- Split `auth.ts` (228→143 lines): extracted `authCallback.ts` for OAuth callback handler
- Split `ModerationConfig.tsx` (229→194 lines): extracted `ModerationFilterOptions.tsx` component
- Split `case.ts` (221→44 lines): extracted `caseHandlers.ts` for subcommand handlers
- Split `recommendationEngine.ts` (227→103 lines): extracted `recommendationHelpers.ts` for helper functions
- Split `EmbedBuilderService.ts` (215→59 lines): extracted `embedValidation.ts` for validation/color utilities
- Split `queueOperations.ts` (232→50 lines): extracted `queueManipulation.ts` for queue manipulation helpers
- Compacted `service.ts` (226→75 lines): removed JSDoc, condensed delegation methods
- Compacted `MusicConfig.tsx` (223→134 lines): condensed imports and JSX
- Compacted `downloadVideo/service.ts` (217→77 lines): extracted helper functions, removed redundant checks
- Split `config.ts` (208→65 lines): extracted `environmentConfig.ts` for ENVIRONMENT_CONFIG object
- Split `automessage.ts` (207→45 lines): extracted `automessageHandlers.ts` for subcommand handlers
- Split `trackValidator.ts` (201→49 lines): extracted `trackSimilarity.ts` for similarity/quality functions
- Deduplicated `trackManagement/` directory: replaced 3 duplicate files with re-exports from parent modules

### Added - Moderation and Management System Implementation (Phases 3-5)

**Phase 3: Bot Commands - Core Moderation**
- Implemented 9 moderation commands in `packages/bot/src/functions/moderation/commands/`:
  - `/warn` - Issue warnings to users with optional DM notification
  - `/mute` - Timeout users with duration choices (60s to 1 week)
  - `/unmute` - Remove timeout from users
  - `/kick` - Kick members from server with optional message deletion
  - `/ban` - Ban users with message deletion options (1h to 7 days)
  - `/unban` - Unban users by ID
  - `/case` - View, update, or delete specific moderation cases (subcommands)
  - `/cases` - List and filter moderation cases with pagination
  - `/history` - View full moderation history for a user with statistics
- All commands use `ModerationService` from shared package
- Proper permission checks (ModerateMembers, KickMembers, BanMembers, Administrator)
- DM notifications to users (configurable with silent option)
- Case tracking with case numbers, reasons, evidence, and expiration
- Appeal system support in case viewing

**Phase 4: Auto-Moderation System**
- Implemented `/automod` command with 7 subcommands in `packages/bot/src/functions/automod/commands/`:
  - `spam` - Configure spam detection (threshold, interval, action)
  - `caps` - Configure caps detection (percentage, min length, action)
  - `links` - Configure link filtering with whitelist support
  - `invites` - Configure Discord invite filtering
  - `words` - Configure bad words filter with custom word list
  - `raid` - Configure raid protection (join threshold, interval, action)
  - `status` - View all auto-moderation settings
- Uses `AutoModService` from shared package
- Configurable actions: warn, mute, kick, ban, delete
- Ignored channels and roles support

**Phase 5: Management Features**
- Implemented 3 management commands in `packages/bot/src/functions/management/commands/`:
  - `/customcommand` - Manage custom commands (create, edit, delete, list, info)
  - `/embed` - Manage embed templates (create, send, list, delete)
  - `/automessage` - Configure auto-messages (welcome, leave, list)
- Custom commands with permissions, usage tracking, and descriptions
- Embed builder with modal interface for template creation
- Auto-messages with placeholder support ({user}, {server}, {memberCount})
- Uses `CustomCommandService`, `EmbedBuilderService`, `AutoMessageService` from shared

**Command Categories Added**
- Updated `packages/bot/src/config/constants.ts` with new categories:
  - `moderation` - 🛡️ Moderation commands
  - `automod` - 🤖 Auto-Moderation commands
  - `management` - 📋 Management commands

**Total Commands Implemented: 15**
- 9 moderation commands
- 1 auto-moderation command (with 7 subcommands)
- 3 management commands (with multiple subcommands each)

**Next Steps** (requires database migration first):
```bash
npx prisma migrate dev --name add_moderation_and_management_systems
npm run db:generate
```

After migration:
- Test all commands in Discord server
- Fix remaining type errors in service method signatures
- Implement event handlers for auto-moderation (messageCreate, guildMemberAdd, guildMemberRemove)
- Implement modal handlers for embed creation
- Add button interaction handlers for case pagination

### Added - Comprehensive Moderation and Management System (Phases 1-3)

**Phase 1: Security & Dependencies**
- Updated axios to 1.13.5+ (CVE-2024-55565 DoS vulnerability fix)
- Updated @sentry/node to 10.38.0
- Updated Prisma 7.3.0 → 7.4.0, @prisma/client 7.3.0 → 7.4.0
- Updated TypeScript ESLint plugins 8.54.0 → 8.55.0
- Updated 20+ packages (framer-motion, i18next, lucide-react, playwright, etc.)
- All type-checking and builds passing

**Phase 2: Lyrics Feature**
- Created `LyricsService` with lyrics.ovh API integration
- Smart query cleaning (removes suffixes, special characters, extracts artist from title)
- Pagination support with Discord button navigation
- Updated `/lyrics` command with full functionality
- Supports both current track lookup and manual search

**Phase 3: Core Moderation System (Database & Services)**
- **Database Schema**: Added 7 new models to Prisma schema
  - `ModerationCase` - Case tracking with appeals, evidence, expiration
  - `ModerationSettings` - Guild mod configuration, roles, channels, DM settings
  - `AutoModSettings` - Auto-moderation rules (spam, caps, links, words, raid)
  - `CustomCommand` - Custom command system with permissions
  - `AutoMessage` - Welcome/leave/auto-response/scheduled messages
  - `EmbedTemplate` - Embed builder templates
  - `ServerLog` - Comprehensive logging system

- **Services Created** (ready for use after DB migration):
  - `ModerationService` - Full case management, appeals, settings, stats
  - `AutoModService` - Spam/caps/links/invites/words filtering, raid protection
  - `EmbedBuilderService` - Template management, validation, color conversion
  - `AutoMessageService` - Welcome/leave messages, auto-responders, placeholders
  - `CustomCommandService` - Custom commands with permissions and usage tracking
  - `ServerLogService` - Message/member/voice/role logging with search

**Documentation**
- Created `docs/IMPLEMENTATION_STATUS.md` - Complete project status and roadmap
- Updated `packages/shared/src/services/index.ts` - Exported all new services

**Next Steps** (requires database migration):
```bash
npx prisma migrate dev --name add_moderation_and_management_systems
npm run db:generate
```

### Changed - docs: remove MCP references

- **Removed**: `docs/MCP_SETUP.md` (Cursor tool/server setup no longer in docs).
- **ARCHITECTURE.md**: New “Cursor” subsection: hooks in `.cursor/hooks.json` and `.cursor/hooks/`; agent behavior and tool usage in AGENTS.md.
- **README.md**: AI development section no longer links to MCP_SETUP; AGENTS.md bullet no longer mentions “MCP tools”.
- **docs/INFISICAL.md**: All “MCP” wording replaced with “Cursor” / “Infisical in Cursor” / “Settings → Tools”.
- **AGENTS.md**: Docs list and Context Forge line no longer reference MCP_SETUP; gateway connection described as “Cursor config / gateway project”.

### Changed - docs cleanup

- **Removed**: UI_PROMPT.md (one-off design spec), youtube-error-handling.md (implementation detail), PORTAINER-SETUP.md (optional path; Portainer note moved to DOCKER.md), REDIS-INTEGRATION.md (content merged into ARCHITECTURE Data layer).
- **Trimmed**: sentry-monitoring.md (env vars and link only), MUSIC_RECOMMENDATION_SYSTEM.md (overview, features, commands, related).
- **ARCHITECTURE.md**: Added Data layer (Prisma, Redis), Monitoring (Sentry), Troubleshooting (YouTube parser errors). Quick reference updated.
- **DOCKER.md**: Optional Portainer section (scripts/portainer-*). **FRONTEND.md**: Removed UI_PROMPT reference.

### Changed - Context Forge gateway: Docker only

- **docs/MCP_SETUP.md**: MCP Gateway (Context Forge) section now describes running the gateway with Docker only (no uvx/Python). Cursor connects via the Docker-based stdio wrapper; virtual server URL uses `host.docker.internal` so the wrapper container can reach the host gateway. Linux note: add `--add-host=host.docker.internal:host-gateway` to the wrapper `docker run` args.
- **docs/mcp.json.example**: Context Forge entry uses `docker` as command with `run --rm -i -e MCP_SERVER_URL=... -e MCP_AUTH=... ghcr.io/ibm/mcp-context-forge:latest python3 -m mcpgateway.wrapper` so no local Python is required. Gateway project (separate repo) README and start.sh are Docker-only.

### Added - Cursor subagents, skills, commands, and MCP guidance

- **Subagents**: Four specialist rules in `.cursor/rules/` — `subagent-frontend.mdc`, `subagent-backend.mdc`, `subagent-discord.mdc`, `subagent-data.mdc`. Apply when acting as that specialist or when the task is primarily that area; each references the matching area rule and skills.
- **Skills**: New project skills in `.cursor/skills/` — `frontend-react-vite` (React, Vite, Tailwind in packages/frontend), `backend-express` (Express API in packages/backend), `e2e-playwright` (E2E tests and browser MCP usage), `mcp-docs-search` (when to use Context7, Tavily, sequential-thinking, etc.).
- **Commands**: `.cursor/COMMANDS.md` documents standard workflows — verify (lint, typecheck, build, test), test E2E, DB operations, deploy checklist, and when to use which subagent/skill.
- **Session hook**: `session-context.sh` now injects subagents, COMMANDS.md, and MCP usage in addition to AGENTS.md and skills.
- **AGENTS.md**: Cursor rules section lists subagents; skills table extended with the four new skills; new “Commands (workflows)” section pointing to `.cursor/COMMANDS.md`; MCP table updated (browser-tools, apify-dribbble, cloudflare naming; note on radar_search, mcp-gateway, desktop-commander, MCP_DOCKER, curl). Hooks section updated to mention subagents and COMMANDS.md.

### Added - Superpowers (Codex) in chat and prompts

- **AGENTS.md**: New “Superpowers (Codex)” section: how to load a skill in Cursor chat or prompts (run `~/.codex/superpowers/.codex/superpowers-codex use-skill <skill-name>` with a real skill name), table of available skill names, and agent behavior (run the command when the user asks for a superpowers skill; use MCP tools as needed).
- **docs/MCP_SETUP.md**: Short note on Superpowers and link to AGENTS.md for the skill list.

### Added - Pre-commit secret analyzer

- **Secretlint**: Pre-commit runs Secretlint on staged files (via lint-staged) to block commits that contain credentials. CI runs `npm run lint:secrets` (Secretlint on full codebase) in Quality Gates to block PRs that introduce secrets. Uses `@secretlint/secretlint-rule-preset-recommend` (AWS/GCP/GitHub tokens, private keys, basic auth, etc.). Config: `.secretlintrc.json`; ignore list: `.secretlintignore`. Documented in docs/CI_CD.md and README.

### Added - Cursor Hooks

- **Cursor Hooks**: Project-level hooks in `.cursor/hooks.json` and `.cursor/hooks/*.sh` for session context injection, format-after-edit (Prettier + ESLint on edited file), shell guard (block dangerous commands), and optional stop logging to `.cursor/hooks.log`. Documented in AGENTS.md and docs/MCP_SETUP.md. `.gitignore` updated so only `.cursor/hooks.json` and `.cursor/hooks/*.sh` are tracked; `.cursor/hooks.log` remains ignored.

### Changed - Docker optimization

- **Frontend**: Added `nginx/frontend.conf` for static-only serving (SPA fallback); frontend container no longer uses reverse-proxy config.
- **Dockerfile**: Split production into `production-bot` (full runtime with ffmpeg/opus/yt-dlp) and `production-backend` (slim node:alpine). Backend healthcheck uses HTTP check on root.
- **docker-compose.yml**: Expose only nginx (port 8080); removed frontend and backend host ports. Added json-file logging (max-size 10m, max-file 3) for all services. Build targets updated to `production-bot` and `production-backend`.
- **docker-compose.dev.yml**: Renamed network and containers to `lucky-*`. Added postgres service for full-stack dev. Same logging limits.
- **scripts/discord-bot.sh**: Dev build uses main Dockerfile with `--target development --build-arg SERVICE=bot` (no root Dockerfile.dev). Production build uses `--target production-bot`. Image tags: `lucky-bot:dev`, `lucky-bot:latest`.
- **Deploy workflow**: Build step uses `--target production-bot` for server image.
- **.dockerignore**: Added `**/dist/` for package build outputs.
- **docs**: Added [docs/DOCKER.md](docs/DOCKER.md); updated [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) Docker section.

### Fixed - Setup and docs consistency

- **Commitlint**: Added `@commitlint/cli` and `@commitlint/config-conventional` to root devDependencies so the commit-msg hook works on fresh install.
- **Env example**: Standardized on `.env.example`; updated README, scripts/discord-bot.sh, and CHANGELOG references from `env.example` to `.env.example`.
- **docs/DEPENDENCIES.md**: Updated stack overview and packages/frontend section to Vite 7, React 19, Tailwind 4; noted Zod 4 deferred; adjusted upgrade order.
- **README**: Aligned CI/Deploy badges, clone URL, and support links with canonical repo LucasSantana-Dev/Lucky.

### Changed - Ignore Playwright report and test-results

- **.gitignore**
  - Added `packages/frontend/playwright-report/` and `packages/frontend/test-results/` so E2E output does not show as modified.

### Changed - Phase 3: @smithy override attempt (incompatible)

- Tried root `overrides` for `@smithy/config-resolver@>=4.4.0` to address critical advisory; incompatible with AWS SDK v3 chain used by @infisical/sdk (SDK v3 depends on @smithy v3). Override reverted. Documented in `docs/DEPENDENCY_UPDATES.md`; wait for @infisical/sdk to upgrade to an AWS SDK that pulls @smithy v4+.

### Changed - Phase 2d (continued): Other frontend majors

- **packages/frontend**
  - Bumped `tailwind-merge` ^2.6 → ^3.0 (Tailwind v4–aligned), `date-fns` ^3.6 → ^4.1, `framer-motion` ^11.18 → ^12.0, `recharts` ^2.15 → ^3.0. Typecheck, build, and backend tests pass.

### Changed - Phase 3: Audit and known vulnerabilities (tracking)

- Re-ran `npm audit` and `npm run audit:critical` after Phase 2d. Known issues remain as documented in `docs/DEPENDENCY_UPDATES.md`: @smithy/config-resolver (via @infisical/sdk), hono/lodash (via prisma), tar (via @discordjs/opus, unleash-client), undici (via discord.js, youtubei.js). No `audit fix --force` or overrides applied; track upstream fixes.

### Changed - Phase 2d: Vite 6 → 7 (frontend)

- **packages/frontend**
  - Upgraded `vite` from ^6.0.7 to ^7.0.0 and `@vitejs/plugin-react` from ^4.3.4 to ^5.0.0. Vite 7 requires Node 20.19+ or 22.12+; CI uses Node 22. No config changes required (no Sass legacy API, deprecated plugins, or advanced options in use).

### Changed - Phase 2c: Zod v3 → v4 (deferred)

- **Zod 4 upgrade deferred:** `@hookform/resolvers` (v3) is not yet compatible with Zod 4.3.x types (`ZodObject` not assignable to `Zod3Type`). Frontend and shared keep `zod@^3.25.x` and `@hookform/resolvers@^3.10.x` until the resolver supports Zod 4. See `docs/DEPENDENCY_UPDATES.md` (Phase 2c).

### Changed - Phase 2b: React 18 → 19 (frontend)

- **packages/frontend**
  - Bumped `react` and `react-dom` to `^19.0.0`, `@types/react` and `@types/react-dom` to `^19.0.0`. Radix UI and other UI libs work with React 19; typecheck and build pass.

### Changed - Phase 2a: Tailwind CSS v4 (frontend)

- **packages/frontend**
  - Upgraded Tailwind CSS from v3.4 to v4.1 via `npx @tailwindcss/upgrade`. Replaced `@tailwind base/components/utilities` with `@import 'tailwindcss'`; migrated theme (colors, radius, keyframes, animations) to `@theme` and `@utility` in `src/index.css`. Removed `tailwind.config.js` (v4 CSS-first config). Replaced `autoprefixer` with `@tailwindcss/postcss`. Updated `components.json` to reference `src/index.css` as Tailwind config source.

### Changed - Phase 1 dependency updates

- **Root package.json**
  - Added `prisma@^7.3.0` (devDependencies). Bumped `@prisma/client` to `^7.3.0`, `prettier` to `^3.8.1`, `globals` to `^17.2.0`, `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to `^8.54.0`.
- **Workspaces**
  - **shared**: `@prisma/client@^7.3.0`, `@sentry/node@^10.37.0`, `ioredis@^5.9.2`, `@types/node@^25.1.0`.
  - **backend**: `express-session@^1.19.0`, `@types/node@^25.1.0`.
  - **bot**: `ws@^8.19.0`, `@sentry/node@^10.37.0`, `@types/node@^25.1.0`.
  - **frontend**: patch/minor bumps for `axios`, `react-router-dom`, `lucide-react`, `@typescript-eslint/*`, `postcss` (no major upgrades in this phase).
- **Backend tests**
  - Updated `express-session` mock in `tests/setup.ts` so it returns a stable middleware (no `jest.fn()` cleared by `resetMocks`), parses session cookie into `req.sessionID`, and provides `req.session.save` / `req.session.destroy` for auth routes.
  - Adjusted 401 expectations: unauthenticated requests (no cookie) now expect `error: 'Not authenticated'`; auth error tests updated to expect 302 redirects with query params where the app redirects on error.
  - Toggles integration: added `express.json()` and re-applied `getFeatureToggleConfig` mock after `clearAllMocks`; OAuth callback tests set session cookie so `req.sessionID` is present.
- **Verification**
  - Ran `npm install`, `npm update`, `npm audit fix` (no `--force`). `type:check`, `build`, `test:ci`, and `audit:critical` pass.

### Added - Dependency update plan

- **docs/DEPENDENCY_UPDATES.md**
  - Phased plan: Phase 1 (safe patch/minor + audit fix, add Prisma CLI), Phase 2 (optional majors: Tailwind v4, React 19, Zod 4, Vite 7), Phase 3 (transitive/security tracking, no force-downgrade). References Tailwind v4 upgrade guide and Prisma 7; rollback and verification steps included.

### Fixed - Pre-commit hook (audit blocking commits)

- **.husky/pre-commit**
  - Removed `audit:high` from the hook; only `audit:critical` runs before each commit so commits are not blocked by high-severity transitive vulnerabilities (e.g. hono, tar, undici).
- **docs/CI_CD.md**
  - Pre-commit section updated: only critical vulnerabilities block commits; high-severity issues remain visible in CI (Quality Gates).

### Fixed - Deploy pipeline (missing SSH secrets)

- **.github/workflows/deploy.yml**
  - Added "Check deploy secrets" step: fails with a clear list of missing secrets and a pointer to docs when `SSH_PRIVATE_KEY`, `SSH_USER`, or `SSH_HOST` are not set in GitHub Actions secrets.
- **docs/CI_CD.md**
  - Added "Deploy secrets (how to add)" with a table and instructions for getting user/host from a local SSH host alias (e.g. `server-do-luk`) and adding the three repository secrets.

### Fixed - CI pipeline (missing lock file)

- **Root**
  - Removed `package-lock.json` from `.gitignore` so the root lock file is committed. CI uses `actions/setup-node@v4` with `cache: 'npm'` and `npm ci`, which require a lock file at the repo root.
- **docs/CI_CD.md**
  - Added "Lock file" section: root `package-lock.json` must be committed for CI.

### Changed - Monorepo cleanup (remove legacy root src/tests)

- **Root**
  - Removed legacy `src/` (config, events, functions, handlers, services, types, utils, webapp) and `tests/` (e2e, integration, load, performance, services, utils, setup); removed `tsup.config.ts`. All code and tests now live in packages.
- **packages**
  - Backend: middleware, routes (including Last.fm), package.json.
  - Bot: config, music commands (including queue re-export), handlers, player trackHandlers, utils (autoplay, duplicateDetection, titleComparison, trackManagement), Last.fm and Twitch modules, package.json.
  - Frontend: removed featureStore.
  - Shared: services index, types (music, optional-infisical), LastFmLinkService, GuildSettingsService, TrackHistoryService, TwitchNotificationService; removed module-alias.d.ts.
- **prisma**
  - Schema updates.
- **docs**
  - .env.example, docs/INFISICAL.md, docs/MUSIC_RECOMMENDATION_SYSTEM.md, docs/WEBAPP_SETUP.md updated.
- **config**
  - .gitignore, ecosystem.config.cjs, jest.config.cjs aligned with monorepo.

### Changed - ARCHITECTURE.md implementation

- **docs/ARCHITECTURE.md**
  - Quick reference line at top with links to Package structure, Package layouts, Command loading, Building, Dependencies.
  - New "Entry points" section: bot (`src/index.ts` → `initializeBot()`), backend (`src/index.ts` → `startWebApp()`), frontend (`main.tsx`), shared (consumed by bot/backend).
  - Nginx: clarified that nginx listens on 80 and is exposed as 8080 on host; `location /api` and `/api/*` → backend:3000, `/` → frontend:80; config path `nginx/nginx.conf`.
  - Docker: table format for postgres, redis, bot, backend, frontend, nginx with roles.
  - New "Repo checklist (matches this doc)": no root src/, Prisma at root, command loading pattern, backend routes/services, nginx routing.
- **README.md**
  - Architecture section updated to describe ARCHITECTURE.md as the single source of truth (entry points, where to add code, command loading, Nginx/Docker, principles).

### Added - CI/CD and testing improvements

- **CI pipeline (`.github/workflows/ci.yml`)**
  - Quality Gates: lint, type-check (shared, bot, backend, frontend), build (all packages), backend `test:ci`, backend `test:coverage`, npm audit (high), check:outdated. Coverage uploaded to Codecov from `packages/backend/coverage/lcov.info`.
  - E2E job: runs after Quality Gates; installs Playwright Chromium in frontend, runs `npm run test:e2e` (Playwright tests for the web app).
- **Root package.json**
  - `type:check` and `build` now include `packages/frontend`.
  - New scripts: `test:e2e` (runs frontend Playwright), `audit:critical`, `audit:high` for pre-commit and CI.
- **Pre-commit (Husky)**
  - Pre-commit runs lint-staged (ESLint + Prettier), then `npm run audit:critical` and `npm run audit:high` (block commit on critical/high vulnerabilities). Commit-msg runs Commitlint (Angular conventional commits).
- **Documentation**
  - **docs/CI_CD.md**: CI jobs (Quality Gates, E2E), pre-commit hooks, deploy workflow, local parity commands.
  - **docs/TESTING.md**: Testing strategy (backend Jest unit/integration, frontend Playwright E2E), where tests live, how to run them.
- **README.md**
  - CI and Deploy badges; new "CI/CD and testing" section linking to CI_CD.md and TESTING.md; "Code Quality Tools" and "Quality and test commands" updated (Husky steps, test and audit commands).

### Added - Last.fm per-user account linking

- **Per-user Last.fm linking**
  - Users can connect their own Last.fm account via `/lastfm link`; tracks they request are scrobbled to their profile. Optional env `LASTFM_SESSION_KEY` remains as fallback when the requester has not linked.
  - **Prisma**: New `LastFmLink` model and migration `20250129120000_add_lastfm_links` to store `discordId`, `sessionKey`, `lastFmUsername`.
  - **Shared**: `LastFmLinkService` (get/set session key by Discord id, unlink) in `packages/shared/src/services/LastFmLinkService`.
  - **Backend**: Routes `GET /api/lastfm/connect` (signed state, cookie, redirect to Last.fm) and `GET /api/lastfm/callback` (exchange token, store link, redirect to frontend). `LastFmAuthService` for token→session exchange. Cookie-parser middleware for state cookie.
  - **Bot**: `lastFmApi` refactored to accept per-user session key; `getSessionKeyForUser(discordId)` resolves DB link or env fallback. Track handlers pass requester’s session key to updateNowPlaying/scrobble.
  - **Discord**: `/lastfm link` and `/lastfm status` under general commands. Connect URL uses signed state (`LASTFM_LINK_SECRET` or `WEBAPP_SESSION_SECRET`) and base from `WEBAPP_REDIRECT_URI`.
  - **Docs**: `docs/LASTFM_SETUP.md` updated with per-user linking, callback URL for backend, and optional global session key. `.env.example`: `LASTFM_LINK_SECRET` comment added.

### Added - Project structure and conventions (ARCHITECTURE.md)

- **docs/ARCHITECTURE.md**
  - New section "Project structure and conventions": root layout, package layouts (shared, bot, backend, frontend), where to add new code, command loading rule for bot (top-level .ts or folder + re-export), principles for maintainability (consistency, shallow trees, one place for cross-cutting code, avoid big restructures, optional path aliases), and what not to do (no Prisma move, no extra abstraction layers, no throwaway scripts/docs).
- **README.md**
  - Link to ARCHITECTURE.md for package structure and conventions under Architecture section.

### Added - Cloudflare Tunnel, domain, and DNS for bot frontend

- **docs/CLOUDFLARE_TUNNEL_SETUP.md**
  - Guide for exposing the Lucky web app at a custom domain over HTTPS using Cloudflare Tunnel: add domain to Cloudflare, change nameservers, install `cloudflared`, create tunnel (remote or local), configure DNS (CNAME), set `WEBAPP_FRONTEND_URL` and `WEBAPP_REDIRECT_URI`, and optional quick tunnel for dev.
- **cloudflared/config.example.yml**
  - Example ingress config for a locally-managed tunnel pointing a hostname to the web app backend port.
- **.gitignore**
  - Ignore `cloudflared/*.json` and `cloudflared/config.yml` so tunnel credentials and local config are not committed.
- **.env.example**
  - Placeholder comments for production/custom domain: `WEBAPP_FRONTEND_URL`, `WEBAPP_REDIRECT_URI` when using Cloudflare Tunnel.

### Fixed - Discord slash command registration (all commands)

- **packages/bot**
  - Music commands were only registering 3 commands (autoplay, recommendation, play) because `music/commands/index.ts` returned a hardcoded list. Switched to `getCommandsFromDirectory` (same pattern as general and download) so all music command files in `functions/music/commands/` are loaded and registered with Discord.
  - Added `functions/music/commands/queue.ts` re-export so the queue command (in `queue/index.ts`) is loaded when scanning the directory.
  - All slash commands (general, download, music) are now sent to the Discord API on bot start; previously only a subset appeared in the client.

### Changed - DEPENDENCIES.md implementation

- **Root package.json**
  - Removed `cors` from dependencies and `@types/cors` from devDependencies so root stays minimal (`@prisma/client` only). `cors` is used only by backend and remains in `packages/backend`.
- **docs/DEPENDENCIES.md**
  - Updated Root section: dependencies are `@prisma/client` only; `cors` lives in backend.
  - Updated Backend section: types stay in devDependencies.
  - Updated Upgrade order: backend types and root cors cleanup reflected as done.

### Added - Twitch Criativaria and Last.fm API

- **Twitch**
  - Documented Criativaria notifications in `docs/TWITCH_SETUP.md` and README: run `/twitch add Criativaria` in the desired Discord channel to get alerts when Criativaria goes live.
- **Last.fm API**
  - Optional direct scrobbling and now-playing updates to a Last.fm account (in addition to the existing plain-text "Now playing" line for .fmbot).
  - `packages/bot/src/lastfm/`: `lastFmApi.ts` (signed POST, `track.updateNowPlaying`, `track.scrobble`) and `index.ts`.
  - Track handlers: on track start call Last.fm `updateNowPlaying` and store start time; on finish/skip call `scrobble` with stored timestamp. Disabled when `LASTFM_*` env vars are missing.
  - Env: `LASTFM_API_KEY`, `LASTFM_API_SECRET`, `LASTFM_SESSION_KEY` (see `docs/LASTFM_SETUP.md`).
  - **docs/LASTFM_SETUP.md**: API account, session key (web auth or mobile auth), behaviour, and references.

### Added - Dependency analysis and maintenance

- **docs/DEPENDENCIES.md**
  - New doc: NPM dependency overview, reliable/non-deprecated choices, package-by-package notes, upgrade order, and guidance to avoid bloat.
- **docs/ARCHITECTURE.md**
  - Linked to DEPENDENCIES.md for dependency and upgrade details.
- **packages/backend**
  - Moved `@types/cors`, `@types/express`, `@types/express-session` to devDependencies (type-only; should not be production deps).
- **packages/bot**
  - Removed unused `module-alias` dependency; tsup resolves paths at build time.
  - Kept `unfetch` and `isomorphic-unfetch` in tsup `external` so the build can resolve a transitive dependency.
- **packages/shared**
  - Removed `src/types/module-alias.d.ts` (no longer needed after dropping module-alias in bot).

### Changed - Full cleanup refactor (packages-only architecture)

- **Architecture**
  - Production runs only `packages/bot` and `packages/backend`; root `src/` and root `tests/` have been removed.
  - Bot no longer depends on root `src/`: all bot code and services (music recommendation, autoplay, guild settings, track history) use `@lucky/shared` or live in `packages/bot`.
  - PM2 `ecosystem.config.cjs`: two apps, `lucky-bot` (packages/bot/dist/index.js) and `lucky-backend` (packages/backend/dist/index.js). Root `dist/index.js` no longer used.
  - Root `tsup.config.ts` removed; build is workspace-only (`npm run build` builds shared, bot, backend).
- **packages/shared**
  - `TrackHistoryService`, `GuildSettingsService`, and related types exported from `@lucky/shared/services`.
  - Removed duplicate `TrackHistoryEntry` from `types/music.ts` (only exported from `TrackHistoryService`).
- **packages/bot**
  - `MusicRecommendationService` and `musicRecommendation/` (recommendationEngine, similarityCalculator, types, vectorOperations) moved from root into `packages/bot/src/services/`; uses `trackHistoryService` and `@lucky/shared/utils` for logging.
  - Autoplay and counters use `guildSettingsService` and `trackHistoryService` from `@lucky/shared/services` instead of root `ServiceFactory`.
  - `stringUtils` and title comparison already in bot; no root dependency.
- **Testing**
  - Root `test` script runs backend tests only: `npm run test --workspace=packages/backend`.
  - Added `test:ci`, `test:coverage`, `check:outdated` for CI.
  - Root `jest.config.cjs` updated to run `packages/backend` tests when Jest is run from repo root.
- **Docs**
  - `docs/ARCHITECTURE.md`: clarified that production is packages-only and shared is the single source for DB, Redis, feature toggles, track history, guild settings; where to add new commands (bot) and API routes (backend).
- **packages/frontend**
  - Removed unused `featureStore.ts`; only `featuresStore.ts` is used (useFeaturesStore in hooks and components).
- **packages/bot**
  - Lyrics command: reply text updated to "Lyrics are not available yet" so it is clearly documented as not implemented rather than a bug.
  - Twitch add/remove: await `twitchNotificationService.add` and `remove` so success checks use the resolved boolean.
  - Title comparison: fixed `stringUtils` import path to `../../misc/stringUtils` (from `utils/music/titleComparison`).

### Fixed - Shared package and code quality

- **packages/shared**
  - Removed broken `ServiceFactory` export (file did not exist in shared; bot uses `@lucky/shared` services directly).
  - Added `src/types/optional-infisical.d.ts` so the build passes when optional dependency `@infisical/sdk` is not installed.

### Added - Twitch stream-online notifications

- **docs/TWITCH_SETUP.md**
  - Added step-by-step **Register your application** section: Twitch Developer Console, form fields (Name, OAuth Redirect URLs with HTTPS requirement, Category, Client type Confidential), and where to get Client ID and Client Secret.
- **Twitch EventSub WebSocket integration**
  - Notify a Discord channel when a configured Twitch streamer goes live
  - EventSub over WebSocket (no public HTTP endpoint); uses user access token for subscriptions
  - Slash commands: `/twitch add <username>`, `/twitch remove <username>`, `/twitch list`
  - Env: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_ACCESS_TOKEN`, `TWITCH_REFRESH_TOKEN` (see `docs/TWITCH_SETUP.md`)
- **Prisma**
  - New `TwitchNotification` model (guild, twitch user, Discord channel); migration added

### Added - .fmbot / Last.fm scrobbling

- **Now Playing visibility for .fmbot**
  - Lucky always sends a plain-text "Now playing: Artist – Title" message when a track starts (autoplay or manual), so .fmbot and other scrobblers can see and scrobble playback when they share the channel

### Added - Cursor rules, skills, and agents

- **Cursor rules**
  - `lucky-project.mdc`: project structure, stack, package layout, conventions (always apply)
  - `lucky-discord-bot.mdc`: Discord commands, player, handlers (packages/bot)
  - `lucky-backend-api.mdc`: Express API, auth, routes (packages/backend)
  - `lucky-frontend.mdc`: React app, pages, components (packages/frontend)
  - `lucky-shared.mdc`: shared config, DB, Redis, types, utils (packages/shared)
- **Skills**
  - `discord-commands`: add or change slash commands
  - `music-queue-player`: play/queue/skip, player lifecycle, track handling
  - `prisma-redis-lucky`: Prisma schema/migrations, Redis usage in shared
  - `lucky-docker-dev`: Docker, compose, local dev runs
- **AGENTS.md**
  - Project summary, rule/skill mapping, when to use which MCP (filesystem, GitHub, Context7, Tavily, Playwright, etc.), agent behavior and commands reference

### Added - MCP setup

- **MCP configuration and docs**
  - `docs/MCP_SETUP.md`: how to configure MCP servers and secrets for Cursor
  - Wrapper scripts and `.env.mcp.example` live under `~/.cursor/` (global Cursor config); secrets are loaded from `~/.cursor/.env.mcp` instead of being hardcoded in `mcp.json`
  - Filesystem MCP server path set to Lucky workspace; chrome-devtools and remote servers use `-y` for non-interactive npx
- **MCP failing-tools fixes**
  - GitHub: use npx `@modelcontextprotocol/server-github` via `run-mcp-github.sh` (no Docker)
  - cloudflare-observability / cloudflare-bindings: use distinct OAuth callback ports (3335, 3336) to avoid EADDRINUSE
  - infisical-craftvaria re-added to `mcp.json`; troubleshooting section in `docs/MCP_SETUP.md` for fetch (Docker), Infisical (env vars)
  - BrowserStack: dedicated `run-mcp-browserstack.sh`; skip cleanly when `BROWSERSTACK_USERNAME`/`BROWSERSTACK_ACCESS_KEY` unset (no init error)
  - Infisical wrappers: skip cleanly when project env vars unset
  - fetch: removed from default `mcp.json` (requires Docker); doc explains how to re-add

### Added - Infisical

- **Optional Infisical integration for environment variables**
  - `ensureEnvironment()` in shared config: loads `.env` first, then fetches Infisical secrets when `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, and `INFISICAL_ENV` are set
  - Bot and backend entrypoints use `ensureEnvironment()` so Infisical works without code changes
  - Optional dependency `@infisical/sdk`; app runs without it when Infisical is not configured
  - `.env.example` documents Infisical-related variables
  - `docs/INFISICAL.md` with setup, MCP usage, and Docker notes

### Added - Web Application

- **Complete Discord OAuth Implementation**
  - DiscordOAuthService for token exchange and user/guild fetching
  - SessionService with Redis-based session management
  - Express session middleware with secure cookie configuration
  - Authentication middleware with requireAuth and optionalAuth
  - Complete OAuth flow: login, callback, logout, status checking

- **Discord API Integration**
  - GuildService for fetching user guilds and checking bot membership
  - Bot invite URL generation
  - Guild status checking (bot added/not added)
  - Admin permission filtering

- **React Frontend Application**
  - Vite + React 18 + TypeScript setup
  - Tailwind CSS with custom dark mode palette (#c33d41 primary, #151516 background)
  - Zustand stores for state management (auth, guild, feature)
  - Axios API client with error interceptors
  - React Router for navigation
  - TypeScript type definitions

- **UI Components**
  - Layout components: Sidebar, Header, ServerSelector
  - Dashboard: ServerGrid, ServerCard, AddBotButton
  - Feature Management: GlobalTogglesSection, ServerTogglesSection, FeatureCard
  - UI primitives: Button, Card, Skeleton, Toast, ErrorBoundary

- **Feature Toggle Management**
  - Global developer toggles (system-wide, developer-only)
  - Per-server/guild toggles (server-specific, admin-managed)
  - Clear visual separation between toggle types
  - Permission-based access control

- **Styling & Polish**
  - Responsive design with mobile-first approach
  - Loading states with skeleton components
  - Error handling with ErrorBoundary and Toast notifications
  - Smooth transitions and animations
  - Dark mode optimized color palette

- **API Routes**
  - Global toggle routes with developer permission checks
  - Per-server toggle routes with admin permission checks
  - Guild management routes
  - Authentication routes

- **Documentation**
  - WEBAPP_SETUP.md with complete setup guide
  - FRONTEND.md with comprehensive frontend documentation
  - API endpoint documentation
  - Environment variable documentation
  - Security considerations

## [Unreleased]

## [2.6.20] - 2026-03-15

### Added

- `/queue rescue` now uses **probe-based URL validation** (`player.search` with
  configurable timeout, default 5 s) to detect actually unresolvable tracks
  (removed videos, geo-blocked content, dead links) in addition to the existing
  structural check. Configurable via `QUEUE_RESCUE_PROBE_TIMEOUT_MS` and
  `QUEUE_RESCUE_REFILL_THRESHOLD` env vars (#278).
- `/queue show` upcoming tracks list now appends an inline **recommendation
  reason tag** (e.g. `fresh artist rotation`, `similar title mood`) next to
  autoplay-sourced tracks, making the autoplay decision transparent at a glance (#275).
- **Now Playing** section in `/queue show` appends a `Recommended because:`
  line when the current track originated from autoplay (#275).

### Added

- **Codebase Simplification and Optimization**: Major refactoring to reduce complexity and improve maintainability
  - Consolidated command loaders: Merged three duplicate command loading utilities into a single implementation
  - Configuration consolidation: Merged `environmentConfig.ts` into `config.ts` for centralized configuration
  - Redis abstraction simplification: Reduced Redis abstraction layers from 4+ to 2 (BaseRedisService + implementations)
  - Service Factory simplification: Simplified ServiceFactory pattern with consistent singleton exports
  - Error handling unification: Removed unused BaseErrorHandler abstract class, unified error handling pattern
  - Player handler modularization: Split 653-line `playerHandler.ts` into focused modules (errorHandlers, trackHandlers, lifecycleHandlers)
  - Queue command refactoring: Extracted formatting and grouping logic from 341-line `queue.ts` into separate modules
  - Enhanced feature toggle system: Two-tier system with global developer toggles and per-server admin toggles
  - Feature toggle web application: Express.js web app for non-technical users to manage feature toggles per server
  - Dependency update notifications: Automated system that checks for dependency updates and sends Discord webhook alerts
  - Monitoring simplification: Consolidated monitoring to Sentry + basic health checks, removed telemetry/metrics complexity

### Changed

- **Architecture Improvements**:
  - Command loading: Single consolidated loader with environment-aware file extension handling
  - Configuration management: Centralized configuration in `config.ts` with environment variable support
  - Redis services: Simplified service instantiation with direct singleton exports
  - Player event handling: Modular event handlers for better maintainability
  - Queue display: Separated formatting and grouping logic for cleaner code organization
  - Feature toggles: Enhanced with `isEnabledGlobal()` and `isEnabledForGuild()` methods
  - Monitoring: Simplified to Sentry error tracking and basic health checks only

### Removed

- **Code Cleanup**:
  - Removed duplicate command loader files: `loadCommands.ts`, `loadCommandsFromDir.ts`
  - Removed `environmentConfig.ts` (merged into `config.ts`)
  - Removed unused `BaseErrorHandler` abstract class
  - Removed complex telemetry/metrics system (simplified to Sentry only)

### Added

- **Unleash Feature Toggle Integration**: Integrated Unleash for feature flag management
  - Replaced custom feature toggle system with Unleash client SDK
  - Support for contextual feature toggles (user/guild-based)
  - Bootstrap data support for offline resilience
  - Automatic fallback to environment-based toggles when Unleash unavailable
  - Feature toggles: DOWNLOAD_VIDEO, DOWNLOAD_AUDIO, MUSIC_RECOMMENDATIONS, AUTOPLAY, LYRICS, QUEUE_MANAGEMENT
- **FFmpeg Replacement**: Replaced deprecated fluent-ffmpeg with direct FFmpeg CLI wrapper
  - Created custom FFmpeg wrapper utility using child_process.spawn
  - Maintains same functionality with better control and fewer dependencies
  - Support for both file and stream inputs
  - Progress tracking support
- **Dependency Updates**: Updated all dependencies to latest versions
  - discord.js: `^14.22.1` → `^14.25.1`
  - @prisma/client: `^6.16.3` → `^7.2.0` (major version upgrade)
  - @sentry/node: `^10.17.0` → `^10.32.1` → `^10.34.0` (security fix)
  - youtubei.js: `^15.1.1` → `^16.0.1` (major version upgrade)
  - @discordjs/builders: `^1.11.3` → `^1.13.1`
  - ffmpeg-static: `^5.2.0` → `^5.3.0`
  - ioredis: `^5.8.0` → `^5.8.2` → `^5.9.1`
  - unleash-client: `^5.4.0` (new, v6.9.0 available but requires migration review)
  - @commitlint/cli: `^20.3.0` → `^20.3.1`
  - @commitlint/config-conventional: `^20.3.0` → `^20.3.1`
  - @types/node: `^25.0.3` → `^25.0.8`
  - @typescript-eslint/eslint-plugin: `^8.51.0` → `^8.53.0`
  - @typescript-eslint/parser: `^8.51.0` → `^8.53.0`
  - All dev dependencies updated to latest versions
- **Removed Dependencies**:
  - fluent-ffmpeg: Removed deprecated package
  - @types/fluent-ffmpeg: Removed as no longer needed
- **Prisma v7 Migration**: Migrated to Prisma v7 with new client architecture
  - Updated generator provider from `prisma-client-js` to `prisma-client`
  - Added required `output` path for generated client
  - Created `prisma.config.ts` for datasource configuration (replaces `url` in schema)
  - Generated client now located at `src/generated/prisma-client`
- **Type Safety Improvements**: Enhanced type safety for Prisma operations with explicit type conversions

### Changed

- **Dependency Validation**: Updated depcheck.config.cjs to properly recognize all used dependencies
  - Added unleash-client, @prisma/client, ioredis, uuid to ignores (used but not detected by static analysis)
  - Added test framework packages to ignores
  - All dependency checks now pass without false positives
- **Feature Toggle System**: Migrated from custom Redis-based toggles to Unleash platform
  - More robust feature flag management with UI and API
  - Support for gradual rollouts and A/B testing
  - Better observability and feature flag lifecycle management
  - Automatic synchronization with Unleash server
- **FFmpeg Integration**: Replaced fluent-ffmpeg with direct CLI wrapper
  - No breaking changes to API surface
  - Better error handling and process management
  - Reduced dependency footprint
- **BREAKING - Prisma v7**: Major breaking changes in Prisma configuration
  - Database connection URL moved from `schema.prisma` to `prisma.config.ts`
  - Generated client location changed (now in `src/generated/prisma-client`)
  - Updated all Prisma Client usage to handle new type system
- **ESLint Configuration**: Updated to ignore generated Prisma client files
- **TypeScript Types**: Improved type safety in DatabaseService with explicit type conversions

### Fixed

- **Security Vulnerabilities**: Addressed security issues where possible
  - Updated @sentry/node to 10.34.0 to fix moderate severity vulnerability (GHSA-6465-jgvq-jhgp)
  - Production dependencies are secure - all vulnerabilities are in dev dependencies only
  - Remaining vulnerabilities in dev dependencies (hono via @prisma/dev, tmp via commitizen) are non-critical
  - These are in development tooling and do not affect production runtime
  - Prisma dev dependency vulnerability (hono) will be resolved when Prisma updates their dev dependencies
- **Dependency Detection**: Fixed depcheck false positives for runtime dependencies
  - All used dependencies now properly recognized by depcheck
- **Prisma v7 Compatibility**: Fixed all Prisma-related type issues
- **Type Safety**: Added explicit type conversions for Prisma query results
- **Build System**: Verified build works with all updated dependencies
- **Type Checking**: All TypeScript compilation errors resolved

### Added

- **Complete TypeScript Error Resolution**: Fixed all 47 TypeScript compilation errors to achieve 100% type safety
- **Major ESLint Improvements**: Reduced ESLint issues from 676 to 296 (56% improvement)
- **Modular Music Recommendation Service**: Refactored MusicRecommendationService.ts (617 lines) into 5 focused modules:
  - `types.ts`: Type definitions and interfaces (44 lines)
  - `vectorOperations.ts`: Vector operations and calculations (115 lines)
  - `similarityCalculator.ts`: Similarity algorithms (161 lines)
  - `recommendationEngine.ts`: Core recommendation logic (250 lines)
  - `index.ts`: Main service orchestration (164 lines)
- **Modular Track Management System**: Refactored trackManagement/index.ts (481 lines) into 8 focused modules:
  - `types.ts`: Type definitions (57 lines)
  - `trackValidator.ts`: Track validation logic (197 lines)
  - `queueOperations.ts`: Queue management operations (226 lines)
  - `queueStateManager.ts`: Queue state management (156 lines)
  - `service.ts`: Main service orchestration (225 lines)
  - `index.ts`: Module exports (39 lines)
- **Enhanced Type Safety**: Replaced all `any` types with proper TypeScript types from discord.js and discord-player
- **Improved Error Handling**: Fixed duration type mismatches and null assertion issues
- **Better Code Organization**: All files now under 250 lines following SOLID principles

### Fixed

- **TypeScript Compilation**: Resolved all 47 TypeScript errors including:
  - Duration type mismatches (string vs number)
  - Import/export resolution issues
  - Type assertion and null check problems
  - Missing method implementations
- **ESLint Issues**: Fixed 380+ ESLint issues including:
  - Non-null assertion violations
  - Explicit `any` type usage
  - Unsafe member access warnings
  - Unused parameter violations
- **Module Resolution**: Fixed circular import issues and missing exports
- **Type Safety**: Improved type definitions throughout the codebase

### Changed

- **File Structure**: Reorganized large files into smaller, focused modules
- **Import Strategy**: Updated import paths to use direct module imports where needed
- **Type Definitions**: Enhanced type safety with proper interfaces and type guards
- **Code Quality**: Improved maintainability with single responsibility functions

### Technical Improvements

- **Zero TypeScript Errors**: Achieved 100% TypeScript compilation success
- **56% ESLint Improvement**: Reduced from 676 to 296 issues
- **Modular Architecture**: All files under 250 lines following SOLID principles
- **Enhanced Type Safety**: Proper TypeScript types throughout the codebase
- **Better Error Handling**: Descriptive error messages and proper type guards

- **ESLint Max Lines Rule**: Added ESLint rule to enforce maximum 150 lines per file for better code maintainability
- **Modular Player Handler**: Refactored playerHandler.ts (764 lines) into smaller, focused modules:
  - `playerFactory.ts`: Player creation and extractor registration
  - `errorHandlers.ts`: Error handling and YouTube error management
  - `lifecycleHandlers.ts`: Player lifecycle event handlers
  - `trackHandlers.ts`: Track management and playback events
- **Modular Play Command**: Refactored play.ts (518 lines) into specialized modules:
  - `queryDetector.ts`: Query type detection and validation
  - `spotifyHandler.ts`: Spotify track and playlist handling
  - `youtubeHandler.ts`: YouTube search and playlist handling
  - `queueManager.ts`: Queue management and track prioritization
  - `responseHandler.ts`: Response formatting and user feedback
- **Modular Embed System**: Refactored embeds.ts (452 lines) into focused modules:
  - `constants.ts`: Embed colors and emojis
  - `types.ts`: Embed type definitions
  - `core.ts`: Core embed creation functions
  - `messageEmbeds.ts`: Message-specific embed functions
  - `musicEmbeds.ts`: Music-related embed functions
  - `errorEmbeds.ts`: Error embed functions
- **Modular Track History Service**: Refactored TrackHistoryService.ts (437 lines) into specialized modules:
  - `types.ts`: Service type definitions
  - `redisKeys.ts`: Redis key management
  - `historyManager.ts`: History management operations
  - `metadataManager.ts`: Track metadata operations
  - `duplicateDetector.ts`: Duplicate detection logic
  - `analytics.ts`: Analytics and statistics
- **Modular Monitoring System**: Refactored monitoring/index.ts (377 lines) into focused modules:
  - `sentry.ts`: Sentry error tracking and monitoring
  - `telemetry.ts`: OpenTelemetry span management
  - `metrics.ts`: Metrics recording and collection
  - `health.ts`: Health check functionality
- **Modular Error Handling**: Refactored errorHandler.ts (361 lines) into specialized modules:
  - `types.ts`: Error handling type definitions
  - `errorWrapper.ts`: Error wrapping and user message creation
  - `retryHandler.ts`: Retry logic and error recovery
- **Modular Duplicate Detection**: Refactored duplicateDetection.ts (355 lines) into focused modules:
  - `types.ts`: Duplicate detection type definitions
  - `tagExtractor.ts`: Tag and genre extraction
  - `similarityChecker.ts`: Track similarity algorithms
  - `duplicateChecker.ts`: Duplicate detection logic
- **Modular Queue Command**: Refactored queue.ts (350 lines) into specialized modules:
  - `types.ts`: Queue display type definitions
  - `queueStats.ts`: Queue statistics calculation
- **Enhanced Play Command Implementation**: Completed modular play command structure:
  - `responseHandler.ts`: Success response creation with rich embeds
  - `queueManager.ts`: Queue management and track prioritization
  - `spotifyHandler.ts`: Spotify track and playlist handling with proper error handling
  - `youtubeHandler.ts`: YouTube search and playlist handling with logging
  - `queryDetector.ts`: Enhanced query type detection
- **Improved Error Handling**: Standardized error handling across all handlers:
  - Fixed type inconsistencies in interaction handlers
  - Improved error message creation and user feedback
  - Enhanced error logging with proper context
- **Code Quality Improvements**: Resolved all linting errors and improved type safety:
  - Fixed unused parameter warnings
  - Improved function signatures and type definitions
  - Enhanced code readability and maintainability
- **Redis Module Refactoring**: Completely refactored Redis configuration to meet line limits:
  - `types.ts`: Redis type definitions and configuration types
  - `config.ts`: Redis configuration setup and environment integration
  - `eventHandlers.ts`: Redis event handling and connection management
  - `operations/base.ts`: Base Redis operations with error handling
  - `operations/stringOperations.ts`: String-specific Redis operations
  - `operations/keyOperations.ts`: Key management Redis operations
  - `client.ts`: Main Redis client implementation
- **Promise Handling Improvements**: Fixed all Promise misuse errors:
  - Replaced async event handlers with proper Promise handling
  - Added proper error catching for async operations
  - Improved event handler reliability
- **Type Safety Enhancements**: Improved type safety across the codebase:
  - Fixed nullish coalescing operator usage
  - Enhanced strict boolean expression handling
  - Improved import type consistency
- **Additional Code Quality Improvements**: Continued refactoring and error fixes:
  - Fixed forbidden non-null assertions in Redis operations
  - Resolved unnecessary conditional warnings
  - Fixed object destructuring warnings
  - Improved unsafe error call handling with proper type guards
  - Fixed missing type imports and unused variable warnings
  - Enhanced error handling in download utilities with proper type checking
- **Further Code Quality Enhancements**: Additional fixes and improvements:
  - Fixed strict boolean expression warnings with proper null checks
  - Resolved nullable number value conditional warnings
  - Fixed unsafe error calls in ytDlpUtils with proper type guards
  - Enhanced music command type safety with proper imports
  - Fixed queue type issues in music commands
  - Improved help command type safety
  - Fixed unused variable warnings with proper error handling
- **Continued Code Quality Improvements**: Additional fixes and enhancements:
  - Fixed unnecessary conditional warnings in Redis and download utilities
  - Resolved strict boolean expression warnings in download services
  - Fixed unsafe error calls in download utilities with proper type checking
  - Enhanced queue command type safety with proper EmbedBuilder types
  - Fixed missing imports in queue commands
  - Improved download video service error handling
- **Aggressive Code Quality Improvements**: Comprehensive fixes across multiple modules:
  - Fixed multiple strict boolean expression warnings in download utilities
  - Resolved unnecessary conditional warnings across download services
  - Enhanced type safety in help command with proper Command type handling
  - Fixed unsafe method calls in music commands (clear, move, lyrics)
  - Improved error handling in ytDlpUtils with proper type guards
  - Fixed template literal expressions and unsafe assignments
  - Enhanced download audio error handling with try-catch blocks
- **TypeScript Error Priority Fixes**: Focused on critical TypeScript errors:
  - Fixed all max-params errors by refactoring functions to use options objects
  - Resolved prefer-optional-chain errors with proper optional chaining
  - Fixed unused variable errors with proper naming conventions
  - Enhanced type safety across music commands (play, pause, move, lyrics)
  - Improved error handling with explicit null/undefined checks
  - Fixed unsafe method calls with proper type casting
- **Aggressive TypeScript Error Resolution**: Comprehensive fixes across multiple modules:
  - Fixed all prefer-optional-chain errors with proper optional chaining
  - Resolved unused variable errors with proper naming conventions
  - Enhanced type safety in music commands (remove, skip, volume, queueEmbed)
  - Fixed strict boolean expression warnings with explicit null/undefined checks
  - Improved error handling in download services with proper type guards
  - Enhanced response handler type safety with proper nullish coalescing
  - Fixed unnecessary conditional warnings across multiple files
- **Comprehensive TypeScript Error Priority Fixes**: Aggressive fixes across multiple modules:
  - Fixed all prefer-optional-chain errors with proper optional chaining
  - Resolved unsafe calls and member access errors with proper type imports
  - Enhanced type safety in music commands (skip, pause, move, lyrics, play)
  - Fixed strict boolean expression warnings with explicit null/undefined checks
  - Improved error handling in download services with proper type guards
  - Enhanced event handler type safety with proper import statements
  - Fixed unnecessary conditional warnings across multiple files
  - Improved Redis service type safety with proper type casting
  - `queueDisplay.ts`: Queue display formatting
  - `queueEmbed.ts`: Queue embed creation
- **Enhanced Type Safety**: Replaced all `any` types with proper TypeScript types
- **New Utility Types**: Added common utility types and composables for better code organization

### Fixed

- **Permanent Opus Fix**: Resolved Docker opus encoder issues by adding proper system dependencies (opus, opus-dev, opus-tools, build-base) to Alpine Linux containers
- **Improved Opus Module Installation**: Moved @discordjs/opus to optionalDependencies and removed fragile post-install workarounds
- **Enhanced Docker Build Process**: Streamlined npm install process without ignoring scripts, ensuring proper native module compilation
- **Autoplay Functionality**: Fixed autoplay track identification and queue replenishment to properly show autoplay songs in queue display

### Changed

- **Complete English Translation**: Translated all user-facing text from Portuguese to English throughout the entire codebase
    - Queue display: "Tocando Agora" → "Now Playing", "Próxima música" → "Next song"
    - Music commands: All error messages, success messages, and descriptions translated
    - Track formatting: "Duração" → "Duration", "Solicitado por" → "Requested by"
    - Statistics: "Ativado/Desativado" → "Enabled/Disabled", "músicas" → "songs"
    - Error messages: "Erro" → "Error", "Música não encontrada" → "Song not found"
    - Command parameters: "para" → "to", "de" → "from", "posicao" → "position", "modo" → "mode", "vezes" → "times"
    - Volume messages: "Volume atual" → "Current volume", "Volume alterado" → "Volume changed"
    - Queue status: "Fila vazia" → "Empty queue", "A fila está vazia" → "The queue is empty"

### Added

- **BREAKING**: Renamed project from Lucky to DiscordBot for generic use
- Unified management script (`scripts/discord-bot.sh`) combining Docker and development operations
- Comprehensive depcheck configuration (`depcheck.config.cjs`) for cleaner dependency management
- Docker-first approach for all application operations
- Enhanced script organization with clear command categorization
- Bot customization options via environment variables (BOT_NAME, BOT_DESCRIPTION, BOT_AVATAR_URL, etc.)
- Generic Docker container names and network configuration
- **Structured Error Handling System**: Comprehensive error management with error codes, correlation IDs, and user-friendly messages
- **Error Types and Classes**: Domain-specific error classes (AuthenticationError, NetworkError, MusicError, YouTubeError, ValidationError, ConfigurationError)
- **Error Correlation Tracking**: UUID-based correlation IDs for error tracking across the application
- **Retry Mechanisms**: Intelligent retry logic with exponential backoff for recoverable errors
- **User-Friendly Error Messages**: Automatic mapping of technical errors to user-friendly Discord embed messages
- **Unified Build System**: Consistent build tooling using tsup for production builds and tsx for development

### Changed

- **BREAKING**: Consolidated `docker.sh` and `dev.sh` into single `discord-bot.sh` script
- **BREAKING**: Updated all package.json scripts to use unified script interface
- Improved Docker integration with fallback to local operations when Docker unavailable
- Enhanced help system with categorized commands (Docker vs Local Development)
- Updated Husky pre-commit hook to v9 compatible format
- **Enhanced Error Handling**: Updated existing error handling to use structured approach with correlation IDs
- **Improved Logging**: Enhanced logging system with structured error information and correlation tracking
- **Updated Documentation**: Enhanced README.md and documentation to reflect new error handling capabilities
- **Build System Optimization**: Replaced mixed tsc/tsup/tsx usage with unified tsup for production and tsx for development

### Removed

- Separate `scripts/docker.sh` and `scripts/dev.sh` files
- Test support from development scripts (project doesn't use tests)
- Redundant script commands and duplicate functionality

### Fixed

- Husky deprecation warnings in pre-commit hooks
- Package-lock.json tracking issues (moved to .gitignore)
- Script command organization and maintainability

## [1.0.0] - 2024-12-19

### Added

- **Bot Customization System**: Complete personalization via environment variables
    - `BOT_NAME`: Custom bot display name
    - `BOT_DESCRIPTION`: Bot description for help commands
    - `BOT_AVATAR_URL`: Custom avatar URL (optional)
    - `BOT_COLOR`: Embed color (hex format)
    - `BOT_WEBSITE`: Website URL
    - `BOT_SUPPORT_SERVER`: Discord server invite link
- **Generic Project Structure**: Renamed from Lucky to DiscordBot for universal use
- **Enhanced Documentation**: Comprehensive customization guide and examples
- **Docker Configuration**: Updated container and network names for generic use

### Changed

- **BREAKING**: Project renamed from Lucky to DiscordBot
- **BREAKING**: Package name changed from `lucky` to `discord-bot`
- **BREAKING**: Script renamed from `lucky.sh` to `discord-bot.sh`
- **BREAKING**: Docker images renamed to `discord-bot:latest` and `discord-bot:dev`
- **BREAKING**: Container names changed to `discord-bot` and `discord-bot-dev`
- **BREAKING**: Network names changed to `discord-bot-network`
- Updated all documentation to reflect generic naming
- Enhanced .env.example with comprehensive customization options

### Removed

- Personal branding references throughout the codebase
- Lucky-specific naming in favor of generic DiscordBot naming

### Fixed

- All script references updated to use new naming convention
- Documentation consistency across all files
- Docker configuration alignment with new naming scheme

## [0.2.0] - 2024-09-10

### Added

- **Discord.js 14.22.1** integration with modern slash commands
- **Discord Player 7.1.0** for advanced music playback
- **YouTube and Spotify** music streaming support
- **Advanced download system** with yt-dlp integration
- **Comprehensive logging** with Sentry integration
- **TypeScript 5.2.2** with strict type checking
- **Docker support** for both development and production
- **Hot reloading** for development workflow
- **Queue management** with shuffle, repeat, and history
- **Autoplay functionality** with intelligent track suggestions
- **Lyrics display** for current and specified tracks
- **Volume control** and audio manipulation
- **Permission system** with role-based access control
- **Multi-guild support** across Discord servers
- **Error handling** and recovery mechanisms
- **Performance monitoring** with OpenTelemetry
- **Code quality tools** (ESLint, Prettier, Husky)
- **Conventional commits** with commitizen integration

### Technical Features

- **Node.js 22.x** with ES modules
- **Alpine Linux** Docker images for production
- **FFmpeg** integration for audio/video processing
- **Modular architecture** with clean separation of concerns
- **Handler pattern** for centralized event management
- **Utility functions** for reusable operations
- **Configuration management** with environment variables
- **Structured logging** with multiple levels
- **Health checks** for container monitoring
- **Security best practices** with non-root containers

### Commands

- **Music Commands**: play, pause, resume, skip, stop, queue, volume, seek, lyrics, shuffle, repeat, clear, remove, move, jump, history, songinfo, autoplay
- **Download Commands**: download, download-audio, download-video
- **General Commands**: ping, help, exit

## [0.1.0] - 2024-01-01

### Added

- Initial release of Lucky
- Basic Discord bot functionality
- Music playback capabilities
- YouTube integration
- Basic command system

---

## Version History

- **v1.0.0**: Generic naming and customization system - renamed to DiscordBot with full personalization options and unified build system
- **v0.2.0**: Complete rewrite with modern architecture, Docker support, and advanced features
- **v0.1.0**: Initial release with basic functionality

## Migration Guide

### From v0.2.x to v1.0.0

1. **Update dependencies**: Run `npm install` to get new dependencies
2. **Update environment variables**: Check `.env.example` for new required variables
3. **Docker setup**: Consider using Docker for consistent environments
4. **Script changes**: Use new unified `discord-bot.sh` script instead of separate scripts
5. **Configuration**: Update any custom configurations to match new structure
6. **Build system**: Now uses unified tsup/tsx build system for better performance
7. **Add customization**: Configure `BOT_NAME`, `BOT_DESCRIPTION`, etc. in your `.env` file
8. **Update documentation**: All references now use DiscordBot naming

### Breaking Changes

- **Script consolidation**: `docker.sh` and `dev.sh` merged into `discord-bot.sh`
- **Package.json scripts**: All scripts now use unified interface
- **Docker-first approach**: Primary operations now use Docker by default
- **Test removal**: Test support removed from development scripts
- **Project renaming**: Lucky → DiscordBot (v1.0.0)
- **Docker naming**: All container and network names updated for generic use
- **Build system**: Unified tsup/tsx build system replaces mixed tsc/tsup/tsx usage

## Contributing

When adding new features or making changes:

1. Update this changelog with your changes
2. Follow conventional commit format
3. Update documentation as needed
4. Test thoroughly before submitting PR

## Links

- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
