# ADR 2026-07-03 — Smart custom commands via a generic `commandKind` + `config` seam

**Status:** Accepted
**Deciders:** Lucas Santana (operator) + decision-critic (Opus, adversarial review)
**Related:** PR #1684 (initial two-column implementation — to be reworked to this decision), the `/vaga` slash command (#1682, merged), reaction-role panels (Criativaria)

## Context

Custom commands today are static per-guild rows (`{name, response, embedData(unused), allowedRoles[], allowedChannels[], enabled}`) triggered by message-prefix; the text typed after the command name is discarded and the handler just `message.reply({content: response})`.

The operator wants custom commands to become **smart**: the text a user types is scanned and the relevant reaction-role roles are auto-pinged, optionally posting to a target channel. First use = a `vaga` (job-posting) command that detects tech-stack / seniority / work-mode / education roles from a pasted job description and pings them in `#vagas`. The operator explicitly framed this as a **product differentiator** and used the plural "smart commands" — i.e. variety (recruit, event-reminder, skill-matcher, …) is expected over time.

An initial implementation (#1684) added two typed columns `smartTags Boolean` + `targetChannelId String?` and reused a bot-local `detectVagaRoleTags` util. A `/research-and-decide` review with an adversarial `decision-critic` returned **NEEDS_REVISION**.

## Decision

Extend `CustomCommand` with a **generic dispatch seam**, not per-feature columns:

- `commandKind String @default("basic")` — `"basic"` (today's static reply) or a smart kind (`"job_post"` first). **String, not a Prisma enum**, so a new kind needs **no migration**.
- `config Json?` — per-kind configuration, validated by a per-kind zod schema. For `job_post`: `{ targetChannelId, notifyRoleLabel?, aliasSet? }`.

Execution dispatches by `commandKind`. The detection engine is renamed and **parameterized**:

- `detectVagaRoleTags` → `detectRolesFromText(text, mappings, { aliases, forcedLabels, vagasRoleId })`. The alias table is **passed in**, not baked in; `JOB_ALIASES` is a named constant the `job_post` kind supplies. This kills the "generic engine named after one use-case" leak and lets future kinds bring their own alias sets.

Guardrails (critic-mandated, required before merge):

- **Enforce `customCommandService.canUseCommand(command, userRoles, channelId)`** (allowedRoles/allowedChannels) **before** running the smart path — otherwise any member who can trigger the command could post to an arbitrary `targetChannelId` and mass-ping (privilege escalation).
- **Validate the bot can post** to `targetChannelId` (channel exists + `SendMessages`); fail loud, not silently.
- **Fail-loud fallback:** if the guild has no reaction-role mappings, warn the invoker ("configure reaction roles first"); if a real post matches zero roles, surface "0 cargos detectados" rather than posting silently.

Invocation stays dual on purpose: the `/vaga` **slash command** (structured `titulo/descricao/url` + choices + ephemeral preview→Publicar) is the polished primary path; the message-prefix **custom-command** path is the generic smart engine (any guild, any kind). Both import the same `detectRolesFromText`.

## Alternatives considered

- **Two typed columns (`smartTags` + `targetChannelId`) — #1684 as built.** Rejected: optimizes for a single kind; the operator confirmed a platform (≥3 kinds) intent, so each new kind would add columns or force a backport. Critic rated this the weakest load-bearing claim ("invisibly commits to a low-variety ceiling").
- **`embedData._meta` JSON blob.** Rejected: couples command config with response/embed shape; no migration but semantically muddled.
- **Separate normalized `CustomCommandAction(kind, config)` table.** Rejected _for now_: over-normalized while a single JSON column on `CustomCommand` suffices; revisit if config validation across many kinds becomes unwieldy.
- **Slash-only, drop the custom-command path.** Rejected: the operator specifically wants the _custom-command_ capability (per-guild, DB-driven, not hard-coded); the slash alone doesn't deliver that.

## Consequences

**Positive:** new smart-command kinds add a config shape + a runner, **zero schema migration**; one shared, parameterized detection engine (no per-use-case fork); opt-in per command (`commandKind` defaults to `"basic"` → existing commands untouched); security boundary made explicit.

**Negative:** `config` is untyped `Json` — must be validated by a per-kind zod schema or it becomes a foot-gun; requires **reworking #1684** (drop the two columns, add the seam, rename the engine, add the gating) before merge; slight indirection for the single kind that exists today.

**Neutral:** dual invocation (slash + prefix) is retained; the `/vaga` slash keeps its own structured flow but shares the engine.

## Revisit when

- **A 4th smart-command kind lands and `config` zod schemas sprawl** → promote to a normalized `CustomCommandAction` table.
- **Kinds never grow past `job_post` within ~3 months** → the generic seam was overhead; collapse back toward the simpler shape.
- **Reaction-role labels are renamed and silently break detection repeatedly** → add label-change warnings / an alias-versioning tool (coupling risk the critic flagged).
- **Operators want non-reaction-role role sources** (e.g. a per-command keyword→role map) → decouple detection from `reaction_role_mappings`.
