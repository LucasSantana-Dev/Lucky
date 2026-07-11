---
status: deferred
date: 2026-07-11
decision: defer-with-gate
---

# RAG re-read routing for large file reads in agent workflows

## Status

Deferred. Mechanism is sound and cost-benefit is clear, but the trigger condition (measured re-read waste across agent sessions) is not yet instrumented.

## Context

### The problem

When agents work through multi-phase tasks (debugging, feature implementation, code review, test generation), they often re-read the same large source files multiple times.

**Concrete case:** `packages/backend/src/services/GuildService.ts` (1,276 lines). A typical multi-agent debugging workflow reads this file:

1. Initial exploration (primary model: full read)
2. Implementation context (primary model: full read)
3. Code-review context (primary model: full read)
4. Test-coverage validation (primary model: full read)
5. Bug-fix verification (primary model: full read)

**Token cost per workflow:**

- Full read cost: ~1,276 lines × 4 tokens/line ≈ 5,100 tokens per read
- Total for 5 reads: 25,500 tokens
- Estimated cost: ~$0.064/workflow (at Sonnet rates, $2.50 per 1M input tokens)

**Other large files in the codebase:**

```
12,289 lines: Guild.ts (Prisma model)
 6,678 lines: prismaNamespace.ts (generated)
 2,713 lines: ReactionRolesService/index.spec.ts
 2,189 lines: BatchJob.ts (Prisma model)
 2,040 lines: GuildSettings.ts (Prisma model)
```

A team running ~10 multi-agent workflows per week would accumulate ~132K tokens of re-read waste monthly, if no deduplication is applied.

### Why it matters

Re-read waste compounds in:

- Multi-phase orchestration workflows (3-agent teams across architecture/builder/reviewer roles)
- Iterative debugging (tracer → fix → verify loops)
- Cross-cutting refactors (multiple agents touching the same files)
- Long-running sessions on a single feature

The efficiency is not trivial when a team is running parallel agent teams.

## Considered options

### Option A: No routing — status quo

- **Mechanism:** Agents continue to read the full file every time.
- **Pros:** No new infrastructure. Simple.
- **Cons:** Unbounded re-read waste. Scales poorly with multi-agent workflows. $0.064+ per workflow in wasted token cost.
- **Verdict:** Rejected — the waste is measurable and structural.

### Option B: Client-side (harness-level) read interception + RAG summary

- **Mechanism:**
    - Hook into the `Read` tool at the harness level.
    - Track read count per file across a session.
    - On the 3rd+ read of a file >1000 lines, intercept and route to a cheap model (Haiku, @free) that ingests the full file and returns a focused summary (100–200 token response).
    - Summary is cached per file per session; subsequent reads return the cached summary.
- **Location:** A Read-tool wrapper in `~/.claude/hooks/` or a dedicated tool in the harness.
- **Invocation:** Agents call Read naturally; the interception is transparent.
- **Pros:**
    - Transparent to agents — no behavior change.
    - Reusable across all agent workflows automatically.
    - Cost savings are immediate (40–50% reduction on re-read waste).
    - Cheap model (Haiku) specializes in summarization.
- **Cons:**
    - Requires harness-level hook architecture (read-count tracking, summary caching).
    - Summary quality is a new variable (Haiku may miss subtle context).
    - Cache invalidation: if file changes mid-session, cache must flush.
    - Adds latency: each 3rd+ read now calls a model (vs. zero latency for a plain Read).
- **Verdict:** Viable, but requires instrumentation first to confirm the trigger.

### Option C: Agent-level hint system

- **Mechanism:**
    - Agents annotate their Read calls: `Read(..., hint: 'summary-ok')` on re-reads.
    - Harness respects the hint and routes to cheap-model summary.
- **Location:** Extension to the Read tool signature.
- **Pros:**
    - Explicit opt-in — agents decide when a summary is sufficient.
    - Fine-grained control.
- **Cons:**
    - Requires agent training and discipline (agents must remember to set the hint).
    - Breaks the "no behavior change" principle — agents need to know about this optimization.
    - Higher adoption friction.
- **Verdict:** Rejected — requires agent cooperation, unlikely to scale.

### Option D: Skill-based read interceptor

- **Mechanism:**
    - New skill `/read-smart` wraps `Read` with auto-detection of re-read + summary routing.
    - Agents call `/read-smart <file>` instead of the Read tool.
- **Location:** `~/.claude/skills/read-smart/SKILL.md`.
- **Pros:**
    - Explicit, visible to agents.
    - Doesn't require harness-level hooks.
- **Cons:**
    - Requires agent adoption (agents must call the skill, not Read).
    - Breaks auto-routing and doesn't scale to subagents.
    - Re-read tracking is per-agent-invocation, not per-session.
- **Verdict:** Rejected — adoption friction and poor subagent isolation.

## Decision

**Defer Option B (client-side read interception) pending instrumentation.**

### Phase 1: Instrument re-read waste

Capture baseline metrics across 4 weeks of routine multi-agent workflows:

- Count re-reads per file per session.
- Measure token cost of re-read waste (existing reads via primary model).
- Identify the top 5 files by re-read frequency and size.
- Calculate cost savings if re-reads were routed to Haiku.

**Trigger:** Implement when:

- Re-read waste > 100K tokens/week (sustained across 2+ weeks), OR
- Re-read waste causes a session to exceed budget (token-cap violation) in >1 session/week

**Data source:** Session transcripts + tool logs in `~/.claude/sessions/`. Can be sampled via `session-insights` skill.

### Phase 2: Implementation (gated on Phase 1 trigger)

If the trigger is met:

1. Build a read-count tracker in `~/.claude/hooks/` that tracks file reads per session.
2. Implement a summary-cache layer (in-memory per session).
3. Wire a cheap-model (Haiku) summarizer that ingests large files and returns a 100–200 token summary.
4. Integrate into the Read tool as a transparent interception.
5. Test with a synthetic multi-agent workflow that intentionally re-reads the same file 5+ times; verify cost savings match projection.

### Phase 3: Revisit condition

**Re-evaluate on 2026-09-11** (3 months):

- Confirm instrumentation shows sustained re-read waste > trigger threshold.
- If yes, unblock Phase 2 implementation.
- If no, close the issue as "monitoring shows not a real problem."

## Consequences

### If deferred (Phase 1 instrumentation)

- Re-read waste continues unchanged until trigger is met.
- Team can estimate monthly token cost and decide via data.
- Low risk: no new code, no behavior change.

### If Phase 2 is eventually implemented

- Read-tool behavior changes: 3rd+ read of large files may return a summary instead of full text.
- Agents may need guidance on interpreting summaries (which are high-level overviews, not complete code).
- Summary cache must be flushed if a file is edited mid-session; this is an edge case (unlikely during an agent workflow).
- Latency increases slightly on 3rd+ reads (model call + response ~2–5 seconds).

### If never implemented

- Re-read waste remains a known inefficiency, managed via workflow design (e.g., avoiding re-reads by passing context between phases).
- Team remains conscious of the trade-off between cost and multi-agent isolation.

## Notes

- **Haiku vs. Sonnet for summaries:** Haiku is dramatically cheaper (~90% cost reduction) and is purpose-built for summarization. Test samples on 2–3 large files first to confirm quality before committing to production use.
- **Cache invalidation:** Session-scoped cache is safe because agent sessions are bounded and files are rarely edited during execution. Add a file-mtime check if paranoia warrants it.
- **Subagent isolation:** Read-count tracking must be session-scoped, not cross-session, to avoid leaking context across independent agent runs.
