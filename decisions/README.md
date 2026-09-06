# Architecture Decision Records

137 ADRs, indexed by status, newest first within each group. Generated from each file's own Status field (or, for the 3 files with none, from its content) - see #1964.


## Accepted (130)

- [2026-09-05 - Skip-reason feedback UX redesign: deferred](2026-09-05-skip-feedback-redesign-deferred.md) - _Accepted (defer)_
- [2026-09-03 - 2026-09-03: Audit gate takes a second npm audit read before passing](2026-09-03-audit-gate-double-read.md)
- [2026-09-03 - 2026-09-03: SoundCloud client_id refresh-and-retry, not a timer](2026-09-03-soundcloud-client-id-refresh-and-retry.md)
- [2026-08-09 - Remove the `/download` feature for Top.gg compliance](2026-08-09-remove-download-feature-topgg-compliance.md)
- [2026-08-03 - Autoplay re-measure: coverage gate PASSED, route to reliability + UX; skip-reason needs UX redesign](2026-08-03-autoplay-remeasure-gate-passed.md)
- [2026-08-03 - Guild Automation: remove the subsystem (D), phased web/backend → bot → schema](2026-08-03-guild-automation-remove.md)
- [2026-08-03 - Last.fm dead sessions: unlink + one DM on error 9, no env fallback in player path](2026-08-03-lastfm-dead-session-handling.md)
- [2026-08-03 - Lavalink re-evaluation: gate not fired, Lavalink stays deferred](2026-08-03-lavalink-reeval-stays-deferred.md)
- [2026-07-27 - CI workflow efficiency refactor: fold micro-workflows, delete dead weight, extract deploy scripts](2026-07-27-ci-workflow-efficiency.md)
- [2026-07-27 - Dependabot reactivated as the dependency bot while Renovate is dark](2026-07-27-dependabot-reactivation.md) - _Accepted (supersedes `2026-05-27-ci-merge-queue-and-renovate.md` and the "Revert to Dependabot is rejected" clause of `2026-06-17-renovate-reactivation.md`)_
- [2026-07-26 - POSTGRES_PASSWORD — harden the compose guard to `:?`, ship an empty placeholder](2026-07-26-postgres-password-env-guard.md)
- [2026-07-16 - Migrations that transform existing objects must be idempotent, verified against a prod-version scratch DB](2026-07-16-idempotent-migrations.md)
- [2026-07-12 - Brand-asset regeneration — hybrid resvg-frame + Gemini-mascot via inference.sh](2026-07-12-brand-asset-regen-tooling.md) - _Accepted — pilot completed (see Pilot outcome + FINAL DECISION below: keep the original mascot)_
- [2026-07-12 - Channel cleanup (#1687) — ship purge-only v1 with mandatory guards](2026-07-12-channel-cleanup-ship-guards.md)
- [2026-07-12 - Moonrepo (moon) adoption — deferred](2026-07-12-moonrepo-adoption-deferred.md) - _Accepted (defer)_
- [2026-07-12 - README presence — ship public-landing visual proof; plumbing is trivial, not a blocker](2026-07-12-readme-presence-visual-proof.md)
- [2026-07-12 - Permission tier for channel-wide / role-wide reminders](2026-07-12-reminder-scope-permission-tier.md)
- [2026-07-12 - Lucky toolchain modernization — Node & TypeScript](2026-07-12-toolchain-modernization-node-ts.md)
- [2026-07-11 - Bot redeploy strategy: no blue/green, accept a minimized single-container gap](2026-07-11-bot-redeploy-no-bluegreen.md)
- [2026-07-11 - Channel TTL-delete mechanism: setTimeout precision + durable periodic sweep](2026-07-11-channel-ttl-delete-mechanism.md)
- [2026-07-11 - Sonar coverage exclusion for `packages/shared/src/`: intentional + documented](2026-07-11-sonar-shared-coverage-exclusion.md)
- [2026-07-08 - CI speedup: paths-filter docker-build first, cache diagnostic before architecture change](2026-07-08-ci-docker-build-paths-filter-phased-speedup.md) - _Accepted (Phase 1 shipped; Phase 2 diagnostic complete; Phase 3 shipped and empirically verified)_
- [2026-07-03 - Smart custom commands via a generic `commandKind` + `config` seam](2026-07-03-smart-custom-commands-generic-config.md)
- [2026-07-03 - Staging test bot for pre-merge live smoke](2026-07-03-staging-test-bot.md)
- [2026-07-02 - Criativaria server config: native AutoMod (alert-only for self-harm), starboard now, scripted REST](2026-07-02-criativaria-server-config-automod-engagement.md)
- [2026-07-02 - Resource hygiene: alert calibration first, allocation second, no app-efficiency work](2026-07-02-resource-hygiene-alert-calibration-first.md)
- [2026-07-01 - Autoplay: deploy-first + 21-day measurement window + release-cadence guard](2026-07-01-autoplay-deploy-first-21d-measurement-window.md)
- [2026-07-01 - Bot monitoring: dead-man-heartbeat-first; logging overhaul deferred](2026-07-01-bot-monitoring-dead-man-first.md)
- [2026-06-27 - Clean up ESLint legacy config and restore react-refresh rule](2026-06-27-eslint-legacy-config-cleanup.md)
- [2026-06-27 - Standardize test runner: migrate Jest tests to Vitest](2026-06-27-standardize-test-runner-vitest.md)
- [2026-06-24 - Autoplay Phase-C baseline: defer the personalization / session-coherence layer (Phase D)](2026-06-24-autoplay-phase-c-baseline-defer-coherence-layer.md)
- [2026-06-24 - Deploy: gate on lucky-frontend + verify the served dashboard SPA](2026-06-24-deploy-frontend-health-gate.md)
- [2026-06-23 - Batch / Bulk Operations: BullMQ In-Process Worker](2026-06-23-batch-operations-bullmq.md)
- [2026-06-23 - ADR: Role Groups Composite Actions & Concurrency Hardening](2026-06-23-role-groups-composite-actions.md)
- [2026-06-22 - Reaction Roles: Dashboard Create/Delete](2026-06-22-reaction-roles-dashboard-create.md)
- [2026-06-22 - Fix release-please combined-PR title so releases auto-tag](2026-06-22-release-please-group-title-pattern.md)
- [2026-06-22 - Twitch EventSub Tier 1 Expansion: stream.offline, channel.update, channel.raid](2026-06-22-twitch-eventsub-tier1-expansion.md)
- [2026-06-21 - Context-Menu (Apps) Command Adoption Strategy](2026-06-21-context-menu-adoption-strategy.md)
- [2026-06-21 - Validation Gate for Destructive / Irreversible Discord Interactions](2026-06-21-destructive-interaction-merge-gate.md)
- [2026-06-21 - Move Message via Context Menu (relocate, not archive)](2026-06-21-move-message-context-menu.md)
- [2026-06-18 - In-bot growth: a utility-first activation aid, not an acquisition lever](2026-06-18-in-bot-growth.md) - _accepted-with-revisions (in-bot = activation/retention; acquisition stays external)_
- [2026-06-18 - Invite permission scope: graceful checks first, then a curated default + on-demand escalation](2026-06-18-invite-permission-scope.md) - _accepted-with-revisions (sequenced — #2 graceful checks ship BEFORE #1 the invite integer)_
- [2026-06-18 - YouTube extraction reliability: classify-and-measure first, weekly yt-dlp refresh, defer Lavalink behind a gate](2026-06-18-youtube-extraction-reliability.md) - _accepted-with-revisions (measurement made real + bounded; big bets data-gated)_
- [2026-06-17 - Growth channel sequencing: measure first, then directories, defer App Directory + SEO](2026-06-17-growth-channel-sequencing.md) - _accepted-with-revisions (sequencing gated behind a 2-week measurement sprint)_
- [2026-06-17 - Hotfix to prod: a committed runbook over the workflow_dispatch fast-path](2026-06-17-hotfix-runbook-workflow-dispatch.md)
- [2026-06-17 - ADR: Reactivate Renovate (App) + add a dark-period health guard](2026-06-17-renovate-reactivation.md)
- [2026-06-16 - Backend Stryker mutation gate: tiered incremental rollout, stays advisory, pilot-gated](2026-06-16-backend-mutation-gate-rollout.md) - _accepted (rollout plan with a cost-measurement gate)_
- [2026-06-16 - Info/usage log storage: self-hosted Grafana Loki, adopted via a measurement-gated pilot](2026-06-16-info-log-aggregation-loki.md) - _accepted (adopt Loki) — implemented; the "stand up Loki" plan was largely moot, see the 2026-06-16 update below_
- [2026-06-16 - Release cadence: automate releases with release-please, keep the deploy gate](2026-06-16-release-cadence-automate-releases.md) - _accepted (adopt release-please; pilot via dry-run before enabling on main)_
- [2026-06-14 - Autoplay mood clustering (#1095): hold and verify data first, don't override the Phase D gate](2026-06-14-autoplay-mood-clustering-1095-hold.md) - _accepted (defer with verification triggers)_
- [2026-06-14 - Deploy status reporting: configure a homelab commit-status token (Option A)](2026-06-14-deploy-status-token.md)
- [2026-06-13 - Message broker (RabbitMQ / Kafka): not adopted — keep Redis pub/sub](2026-06-13-message-broker-rabbitmq-kafka.md) - _accepted (no change)_
- [2026-06-13 - Backend→bot Twitch refresh signal: dedicated TwitchControlService, not a shared bus (yet)](2026-06-13-twitch-refresh-signal-transport.md)
- [2026-06-12 - Guild FK constraints: target discordId, cascade on guild dependents, no user FKs](2026-06-12-guild-fk-constraints.md)
- [2026-06-12 - Idempotency posture: targeted dedup at evidenced sites + a house pattern, no blanket protocol](2026-06-12-idempotency-posture.md)
- [2026-06-11 - Security headers: hybrid placement (helmet + vercel.json + nginx), HSTS at the Cloudflare edge only](2026-06-11-security-headers-placement.md)
- [2026-06-10 - Defer extraction of the autoplay/recommendation engine into a standalone OSS library](2026-06-10-defer-autoplay-engine-extraction.md) - _Accepted (defer — re-open on the explicit triggers below). Decider: Lucas Santana._
- [2026-06-10 - Fix-queue delivery model: serial PR-per-issue, with a deletion-batch carve-out](2026-06-10-fix-queue-delivery-model.md)
- [2026-06-07 - Autoplay: Last.fm seed-similarity spine + fail-closed genre guard](2026-06-07-autoplay-seed-similarity-spine.md)
- [2026-06-06 - Decommission backend GuildAutomationExecutionService](2026-06-06-decommission-backend-guild-automation-execution-service.md)
- [2026-06-06 - Freeze the Guild Automation executor migration; instrument usage before completing or descoping](2026-06-06-guild-automation-migration-freeze-and-instrument.md)
- [2026-06-06 - Web Guild Automation "apply" is plan-only until the executor migration lands](2026-06-06-web-guild-automation-apply-plan-only.md)
- [2026-06-05 - CSRF posture for the backend API](2026-06-05-csrf-posture.md) - _Accepted, amended 2026-08-21 (see Amendment at the end — the deployed cookie is `SameSite=None`, not `lax`)_
- [2026-06-05 - docs/ holds human documentation only; decisions tracked at root, specs/plans untracked](2026-06-05-docs-layout-real-docs-only.md)
- [2026-06-05 - Record auto-rollback last-good from the deployed image's COMMIT_SHA, not git HEAD](2026-06-05-rollback-last-good-from-image-commit-sha.md)
- [2026-06-05 - Defer publishing the `similarity` util as a standalone npm package](2026-06-05-similarity-package-extraction.md) - _Accepted (decision: defer / keep internal)_
- [2026-06-04 - Deploy time: replace the 30-min bake timer with active health-gated rollback](2026-06-04-deploy-time-active-rollback-over-bake-timer.md)
- [2026-06-04 - Guild FK target column + cascade semantics](2026-06-04-guild-fk-target-and-cascade.md)
- [2026-06-04 - Redundancy consolidation across bot/shared](2026-06-04-redundancy-consolidation.md)
- [2026-06-04 - @lucky/shared subpath exports policy](2026-06-04-shared-package-exports-policy.md)
- [2026-06-04 - Support report intake + correlation in error surfaces](2026-06-04-support-report-intake.md)
- [2026-06-03 - track_history guild FK should reference guilds.discordId, not guilds.id](2026-06-03-track-history-guild-fk-correction.md)
- [2026-06-01 - Resolving Discord user IDs to display names: denormalize at write-time, not a shared identity cache](2026-06-01-discord-display-name-resolution.md)
- [2026-06-01 - Drop the Redis read-through caches over Postgres (moderation, custom commands, role access)](2026-06-01-drop-redis-read-through-caches.md)
- [2026-06-01 - Logging/observability hardening: enforce the existing infra, ship hang/429 hotfixes first](2026-06-01-logging-observability-hardening.md)
- [2026-06-01 - Musical Taste / Discover performance: bound-and-degrade + bounded in-memory caches (gated on Spotify quota-mode)](2026-06-01-musical-taste-discover-performance.md) - _Accepted — gate cleared 2026-06-01 (see §0); proceed with the operational fix._
- [2026-06-01 - Public-route SEO rendering for the SPA: build-time per-route meta, not a framework](2026-06-01-public-route-seo-rendering.md)
- [2026-06-01 - Recommendation feedback: explicit→Postgres, artist→unify on userArtistPreference, implicit→in-memory](2026-06-01-recommendation-feedback-storage.md)
- [2026-06-01 - Remove Criativaria Baseline Dashboard Feature](2026-06-01-remove-criativaria-baseline.md)
- [2026-05-31 - Guild settings: Postgres is the source of truth, read directly (no cache)](2026-05-31-guild-settings-postgres-source-of-truth.md)
- [2026-05-31 - Redis scope reduction: migrate KV/cache to Postgres + in-memory, retain Redis only for the bot↔backend music pub/sub](2026-05-31-redis-scope-reduction.md)
- [2026-05-31 - Distributed tracing: defer reaffirmed — Sentry already gives OTel-based tracing; raw OTel→Tempo not worth it yet](2026-05-31-tracing-defer-reaffirmed.md)
- [2026-05-30 - Observability remediation: alert-first minimal, defer OpenTelemetry](2026-05-30-observability-remediation-strategy.md)
- [2026-05-28 - Branch strategy: main-as-trunk (retire versioned release branches)](2026-05-28-branch-strategy-main-as-trunk.md)
- [2026-05-28 - ADR: TSDoc Coverage Enforcement for packages/shared](2026-05-28-shared-package-doc-coverage-tooling.md)
- [2026-05-27 - ADR: Strict Status Checks + Renovate to eliminate stale-cache CI failures](2026-05-27-ci-merge-queue-and-renovate.md)
- [2026-05-27 - Docker build check uses parallel matrix in ci.yml without path filters](2026-05-27-docker-build-check-workflow-architecture.md)
- [2026-05-27 - ADR: Canonical Skill Creation Tool](2026-05-27-skill-creation-canonical-tool.md)
- [2026-05-25 - Release cadence: Docker build as required PR check + production deploy wait timer](2026-05-25-release-cadence-gates.md)
- [2026-05-24 - ADR: Bot Docker HEALTHCHECK — Gateway Readiness over Redis TCP Ping](2026-05-24-bot-docker-healthcheck-gateway-signal.md)
- [2026-05-24 - CI runtime: baseline accepted, sharding deferred](2026-05-24-ci-runtime-baseline-accepted.md) - _Accepted (baseline); sharding deferred_
- [2026-05-24 - ADR: Async Deploy Completion Signal via GitHub Commit Statuses](2026-05-24-deploy-async-completion-signal.md)
- [2026-05-24 - ADR: Deploy Bot Health Gate — Required Container + Gateway Poll](2026-05-24-deploy-bot-health-gate.md)
- [2026-05-24 - Deploy CI: wait for homelab deploy completion on `docker_rebuilt=true` path](2026-05-24-deploy-ci-deploy-completion-wait.md) - _Accepted (no explicit status field; settled by content)_
- [2026-05-24 - ADR: Deploy Lock Contention — Fail Fast with Error Commit Status](2026-05-24-deploy-lock-contention-signal.md)
- [2026-05-24 - ADR: Deploy OAuth Redirect Smoke Check — Hard Fail on Sustained 429](2026-05-24-deploy-oauth-redirect-smoke-check-429-handling.md)
- [2026-05-24 - ADR: Docker BuildKit npm cache key strategy](2026-05-24-docker-npm-cache-key-strategy.md)
- [2026-05-23 - ADR: Extract ArtistSuggestionService from the artists Route Handler](2026-05-23-artist-suggestion-service.md)
- [2026-05-23 - ADR: Introduce AutoplayContext Value Object in the Autoplay Pipeline](2026-05-23-autoplay-context-value-object.md)
- [2026-05-23 - Bot Phase 4 continuation strategy: rebase #956, stage merges, batch #959-962](2026-05-23-bot-phase4-continuation-strategy.md)
- [2026-05-23 - Bot test reduction Phase 4: deletion + replacement strategy](2026-05-23-bot-test-reduction-phase4-replacement-strategy.md)
- [2026-05-23 - ADR: Branch Protection Required Status Checks for `main`](2026-05-23-branch-protection-required-checks.md)
- [2026-05-23 - ADR: Split GuildAutomationService into Orchestrator and Repository](2026-05-23-guild-automation-orchestrator-repository-split.md)
- [2026-05-23 - ADR: Lucky OSS Positioning — Portfolio + Reference Implementation](2026-05-23-lucky-oss-positioning.md)
- [2026-05-23 - ADR: Replace messageHandler Kitchen-Sink with a MessagePipeline Chain](2026-05-23-message-pipeline-handler-chain.md)
- [2026-05-23 - ADR: Collapse Recommendation Engine to a Single Public Entry Point](2026-05-23-recommendation-engine-single-entrypoint.md)
- [2026-05-23 - Repo organisation: what AI-tool config is tracked](2026-05-23-repo-organisation-tracked-ai-config.md) - _Accepted (no explicit status field; settled by content)_
- [2026-05-21 - Autoplay recommendation system: telemetry-first roadmap](2026-05-21-autoplay-recommendation-roadmap.md) - _Accepted — Roadmap completed at Phase C (2026-06-24); coherence/personalization layer (Phase D) deferred. Phase-C baseline showed >85% per-source acceptance (the pre-committed defer condition); see `decisions/2026-06-24-autoplay-phase-c-baseline-defer-coherence-layer.md`. (Original: sequencing decision; individual phases each ship behind their own PR.)_
- [2026-05-21 - Migrate backend code from Zod 3 to Zod 4 API](2026-05-21-backend-zod-3-to-4-migration.md) - _Accepted (implementation pending)_
- [2026-05-21 - Break Cycle C via direct imports + minimal extraction (audioFeatures, vcWeights)](2026-05-21-cycle-c-direct-imports-and-audio-features-extraction.md) - _Accepted (implementation in this PR)_
- [2026-05-21 - DiscordWriteAdapter port for Module Executors](2026-05-21-discord-write-adapter-port.md) - _Accepted (design only; implementation pending)_
- [2026-05-21 - Replace plan-limited PR review tools](2026-05-21-replace-plan-limited-review-tools.md)
- [2026-05-20 - Guild Automation drift records are updated by the apply path, not just by `/plan`](2026-05-20-guild-automation-drift-persistence.md)
- [2026-05-20 - Guild Automation Module Executors are built at orchestrator composition roots, not as shared singletons](2026-05-20-guild-automation-executor-composition.md)
- [2026-05-20 - Guild Automation Module Executors return a discriminated-union result and apply ops best-effort](2026-05-20-guild-automation-executor-partial-failure.md)
- [2026-05-20 - Guild Automation Module Executors emit a per-op `protected` flag; manifest absence is a disable-intent under protected reconcile](2026-05-20-guild-automation-manifest-absence-semantics.md)
- [2026-05-19 - AutoMod actions do not create Moderation Cases](2026-05-19-automod-does-not-create-moderation-cases.md)
- [2026-05-19 - Guild Automation reconciles via Module Executors with a Capture / Diff / Apply seam in shared](2026-05-19-guild-automation-module-executors.md)
- [2026-05-19 - Queue resolver keeps its 6-path defensive fallback chain (for now)](2026-05-19-queue-resolver-defensive-fallback-chain.md)
- [2026-05-16 - Dependabot batch handling: split majors from patches](2026-05-16-dependabot-batch-handling-policy.md)
- [2026-05-16 - Next refactor target: bot circular dependencies (not dual-lockfile)](2026-05-16-next-refactor-target-bot-circular-deps.md) - _Accepted (decision). Selects the next `/refactor-pipeline` target after surveying the open refactor backlog._
- [2026-05-16 - Image scanning in CI: extend Trivy, keep Snyk for dashboard only](2026-05-16-trivy-image-scan-vs-snyk-in-ci.md) - _Accepted (decision). Triggered by Snyk audit on 2026-05-15 surfacing 3 critical + 11 high CVEs in `lucky-nginx` and `lucky-frontend` images that the existing CI security stack had missed._
- [2026-05-15 - No AI-generated docs in tracked repo state](2026-05-15-no-ai-generated-docs-in-tracked-state.md) - _Accepted (decision). Triggered by reviewing `packages/frontend/LIBRARY_RECOMMENDATIONS.md` and discovering ~9,650 lines of similar noise across 18 tracked files._
- [2026-05-14 - ADR: Discord Bot Integration Testing Strategy](2026-05-14-discord-integration-testing-strategy.md)
- [2026-05-13 - Stay on `node:22-alpine` (not bookworm-slim, not distroless)](2026-05-13-base-image-stay-on-alpine.md) - _Accepted (flips Phase-1 recommendation)_
- [2026-05-13 - Deploy target: keep homelab; defer migration](2026-05-13-deploy-target-keep-homelab.md) - _Accepted (decision). Audit-triggered. Replaces the "broken deploy" RED finding_
- [2026-05-13 - Consolidate frontend Dockerfile into main multi-stage build](2026-05-13-frontend-dockerfile-consolidated.md)
- [2026-05-13 - Stay on docker-compose v2 (single-node homelab)](2026-05-13-orchestration-stay-on-compose.md)
- [2026-05-09 - Bot test suite cleanup strategy and proportionality target](2026-05-09-bot-test-suite-cleanup-strategy.md) - _Accepted (in progress)_
- [2026-04-21 - Lucky redesign port target](2026-04-21-redesign-port-target.md)

## Proposed (2)

- [2026-07-11 - Blue/green zero-downtime deploys — true B/G for web tier, fast-rollover for bot](2026-07-11-bluegreen-web-tier.md) - _Proposed (Phase 1 — web tier B/G on staging, ready for sign-off; Phase 1b — prod wiring deferred for explicit operator cutover)_
- [2026-05-13 - Docker Surface Overhaul (chore/docker-overhaul)](2026-05-13-docker-overhaul.md)

## Deferred (2)

- [2026-07-11 - RAG re-read routing for large file reads in agent workflows](2026-07-11-rag-reread-routing.md)
- [2026-05-24 - CandidateAggregator seam on the Replenisher is deferred](2026-05-24-candidate-aggregator-deferred.md)

## Superseded (3)

- [2026-06-16 - YouTube extraction reliability: po_token on the existing extractor, gated on a homelab verification test](2026-06-16-youtube-extraction-reliability.md) - _superseded by verification (2026-06-16) — po_token NOT needed; root_
- [2026-05-23 - Bot Phase 4 test-reduction execution strategy: staged pilot before full parallel](2026-05-23-bot-phase4-execution-strategy.md) - _Superseded by `decisions/2026-05-23-bot-phase4-continuation-strategy.md`_
- [2026-05-13 - Keep `Dockerfile.frontend` separate (deferred consolidation)](2026-05-13-frontend-dockerfile-keep-separate.md) - _Superseded by [PR #851 — `refactor/dockerfile-frontend-consolidation`](https://github.com/LucasSantana-Dev/Lucky/pull/851)_
