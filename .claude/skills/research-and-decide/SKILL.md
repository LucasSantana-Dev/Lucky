---
name: research-and-decide
description: "Decide with three modes: quick (small reversible pick), full (research, critic, plan, ADR), now (break analysis paralysis: 'just decide'). Use to evaluate a library, pattern or architecture, or force a call."
user-invocable: true
auto-invoke: choice-questions + library-evaluations
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/research-and-decide
triggers:
    - research
    - research and decide
    - evaluate options
    - library choice
    - decide
    - make a decision
    - record decision
    - decide now
    - just decide
    - pick one
    - stop deliberating
    - force decision
---

# Research and Decide

You make decisions all day; most never get captured. This skill has three modes:
quick for small reversible picks, full for the research, critique, plan, ADR
pairing so the rationale survives, and now to break a deadlock.

## Mode selection

Pick the mode before doing anything else. State it in one line.

| Mode  | Use when                                                                                                                                                                                                                               | Output                                                               | Skips                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| now   | The answer depends on current state (memory, git, plans, PR/CI): merge now or wait, fix or defer, which task first, A or B for this task; OR the user says "just decide", "pick one", "stop deliberating"; OR 3+ turns went in circles | Decision / Why / Tradeoff / Next step                                | Research pipeline, ADR                                 |
| quick | Context-free, small, reversible within an afternoon (Array.find vs lodash in one component)                                                                                                                                            | Decision / Why / Tradeoff / Next step, under 200 words               | Research pipeline, DECISION BRIEF, ADR, reconciliation |
| full  | Architecture, library, tooling, vendor choice; undo cost above a day; future agents must know why                                                                                                                                      | Phases 1-5, final reply ends with DECISION BRIEF then reconciliation | Nothing                                                |

Tie-break, in this order: depends on current state -> now; else context-free and
reversible within an afternoon -> quick; else full. Quick escalates to full when
critic-level risks (lock-in, migration cost, public-facing surface) appear. Full
never runs when the user said "just decide".

## Quick mode

1. Name the one option you recommend. No open-ended menu.
2. Answer with the four labelled lines below (Decision, Why, Tradeoff, Next step),
   inline, under 200 words. Why is grounded in project context when available.
3. Do not mention an ADR or DECISIONS.md line, do not emit a DECISION BRIEF, do not
   run the phases or a reconciliation block.
4. Apply the owner/T3 carve-out below.

## Now mode (deadlock breaker)

Grounds the call in current state, not generic best practice. Timebox: minutes,
one pass, no research phase.

1. Load only what the question needs:

| Question type        | What to load                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| Merge / PR readiness | `gh pr view <N>`: CI status, open review threads, bot state, PR author and commenters |
| Prioritization       | Memory index, open issues, active plans, recent commits                               |
| Approach selection   | Recent ADRs, CLAUDE.md constraints, active plans, memory                              |
| Bug fix vs defer     | CI state, PR stack, issue severity, what is in flight                                 |
| External state       | Handoff at `~/.claude/handoffs/<project>/latest.md`                                   |

Always load CLAUDE.md hard rules (a rule there can override everything). 2. Synthesize: does a rule constrain the options? What fits the current trajectory
of work? Does memory record a similar decision and its outcome? Any blockers or
dependencies? Cost of being wrong (reversible: bias to action; irreversible: bias
to caution)? 3. Output always the shape below, no hedging, no "it depends" without a verdict.

If genuinely ambiguous, say so and name the single missing piece that would resolve it.
What it records: nothing durable by default (chat verdict only). If future agents
need to know it was decided, invoke `adr-write` for a DECISIONS.md line only (no research).

Example. User: "Should I merge PR #45 now or wait for CodeRabbit?"

```
Decision: Merge now.
Why: All 5 CI checks are green. CodeRabbit has no blocking findings, and bots never block a merge per CLAUDE.md; the PR has no human author or commenter, so no hard halt applies. Waiting adds delay without safety.
Tradeoff: CodeRabbit may flag something after merge; fixable in a follow-up commit.
Next step: Merge is T2: run the critic gate, log to autonomy-gates.jsonl, then `gh pr merge 45 --squash`.
```

## Output format (quick and now)

```
Decision: <one-line verdict, the actual choice>
Why: <2-3 sentences grounded in project context when available; cite PR #N, memory note, ADR slug, plan phase>
Tradeoff: <what you give up, one sentence>
Next step: <smallest concrete action; a T2 action names the critic gate>
```

### Owner/T3 carve-out (quick and now)

"Rules" means all of CLAUDE.md: hard rules, autonomy tiers, owner routing.
Bots (CodeRabbit etc.) never block a merge. A PR authored by, or commented on by,
another human is a hard halt. If the choice is T3 (destructive, production,
other-author PR, money, outward publish) or a business/product/quality call with
no rule and no owner statement, output `Decision: escalate to owner`, put the
recommended option in Why, and the single question in Next step. The 3-turn
self-trigger is never an owner statement.

## Full mode

Phases 1-5 below. The FINAL reply must contain the DECISION BRIEF (Recommendation,
Confidence, Evidence, Alternatives compared with a tradeoff each, concrete Switch
triggers) addressing the stated constraints, followed by the reconciliation block;
never only the reconciliation block.

## Auto-invocation triggers

- User asks to "decide between X and Y", "pick a tool/approach and document it"
- After `adr-gap` flags an undocumented decision that needs retroactive capture
- User says "just decide", "pick one", "stop deliberating" (now mode)
- User asks "should we use X or Y", "is X worth adopting", "what's the right pattern for"
- Comparing libraries, frameworks, services, or architecture options
- Evaluating a vendor / API / SaaS adoption
- Spec-driven design questions before implementation

## Workflow

### Phase 1: Research (always)

- Open-ended exploration: invoke `grill-with-options` (explore mode) to surface options and constraints
- Specific tech evaluation: invoke `deep-research` for web + docs + repo evidence
- Output: 5-10 candidates with one-line tradeoff per candidate

### Phase 2: Challenge (always, this is what makes the decision durable)

Invoke `critic` agent (Opus, multi-perspective review) on the leading 1-2 options:

- Cost over 12 months
- Migration friction
- Lock-in risk
- Failure modes specific to your stack
- What changes the answer (revisit triggers)

Apply the `decision-discipline.md` standard's 5-step scaffold
(CLAIM → EXTRACT → DOUBT → RECONCILE → STOP) on the leading artifact,
critic invocations should pass ARTIFACT + CONTRACT only, never the CLAIM
or your reasoning (that biases the reviewer toward agreement).

If `critic` flips the leading option → loop back to Phase 1 with the new dimension
to evaluate.

### DECISION BRIEF (checkpoint after Phase 2, before Phase 3)

Emit before planning or recording:

```
DECISION BRIEF
  Recommendation: <chosen option>
  Confidence:     <low | medium | high>, <one-line reason>
  Evidence:       <sources, benchmarks, repo facts>
  Alternatives:   <each option compared, with a tradeoff each; rejected ones with reason>
  Switch triggers: <specific, observable: a named metric, threshold or event>
```

Switch triggers must be concrete (for example "p95 session lookup above 20 ms at
150k DAU"), never "when requirements change" or "when the team grows".

### Phase 3: Plan adoption (only if a decision is made)

Invoke `plan` to sequence:

- Pilot scope (1 module or feature)
- Success criteria for the pilot
- Rollback plan if the pilot fails
- Full-rollout sequencing

Skip Phase 3 if the decision is "no change" or "defer".

### Phase 4: Record (always, at proportional fidelity)

Apply the record gate (memory `feedback_research_and_decide_always_2026-05-25`):

Full ADR via `adr-write` ONLY when a gate trips:

- public-facing repo | undo-cost ≥ a sprint | rejection of a recurring
  alternative | forced post-incident record

Full ADR content: context, decision (or "deferred" + re-open trigger),
alternatives with rejection reasons, consequences, revisit-when.

Otherwise append ONE status-prefixed line to the repo's `DECISIONS.md` (format
in `adr-write` §1): status, date, imperative decision, one-line why. Deferred
verdicts include the re-open trigger in the line. Sub-gate decisions never get
the full template; afternoon-reversible choices get no record at all.

### Phase 5: Capture for future search

Invoke `knowledge-loop` to ensure the ADR is indexed and surfaceable from RAG. The
ADR is worthless if you can't find it 6 months later.

## Reconciliation

Full mode ends with this block. Mode, Stake and Confidence fields must be populated. Stake: LOW (undo within an afternoon), MED (undo within a sprint), HIGH (undo costs more than a sprint or is irreversible).

```
RESEARCH AND DECIDE: <question>
  Mode / Stake / Confidence: full / <LOW|MED|HIGH> / <low|medium|high>
  Phase 1 Research:      N candidates explored, top 2: <X> vs <Y> ✅ DONE
  Phase 2 Critique:      <flipped winner Y/N>, key risks identified ✅ DONE
  Phase 3 Plan:          <pilot path / deferred / no-change> ✅ DONE
  Phase 4 Record:        <docs/adr/YYYY-MM-DD-slug.md | DECISIONS.md line> ✅ DONE
  Phase 5 Indexed:       RAG chunks added ✅ DONE
  Open watch:            (none) | <e.g. "pilot <option> in <scope>, revisit when <trigger>">
```

## Outputs / Evidence

- Research summary (Phase 1)
- Critic assessment (Phase 2)
- Adoption plan if applicable (Phase 3)
- ADR file or DECISIONS.md line (Phase 4, per the record gate)
- RAG indexing confirmation (Phase 5)

## Failure / Stop Conditions

- Phase 1 or 2 inconclusive ("no clear winner", "needs more constraints") → stop,
  emit "Inconclusive: [reason]. Provide constraints." and do NOT write an ADR for
  an undecided question. Never write an ADR that says "we haven't decided yet"
- Phase 4 duplicate: if the decision is already in `DECISIONS.md` or `docs/adr/`,
  skip creation and surface the existing path
- Phase 2 critic identifies a blocker the research missed → loop, do not push the
  weaker option through
- User cannot articulate at least one alternative considered → push back
  ("if there was no alternative, this isn't a decision worth recording")
- Refuse to write Phase 4 ADR without a revisit-when condition; permanent
  decisions tend to outlive their value
