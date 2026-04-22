# gstack Supabase patterns — reference notes for Lucky's migration

Source: [`garrytan/gstack`](https://github.com/garrytan/gstack) at commit
[`54d4cde`](https://github.com/garrytan/gstack/tree/54d4cde773267526b6a1f1a2a6a4bad2e438df74),
MIT-licensed (see [LICENSE](https://github.com/garrytan/gstack/blob/54d4cde/LICENSE)).

This is a **reference**, not a port. None of the gstack code lives in the
Lucky tree. It exists to inform decisions during the in-flight
[Supabase migration (PR #764)](https://github.com/LucasSantana-Dev/Lucky/pull/764).

Lucky's Supabase setup lands in `sa-east-1` with projects `lucky-prod` and
`lucky-staging` (see [`.claude/plans/supabase-migration-2026-04-21.md`](../../.claude/plans/supabase-migration-2026-04-21.md)).

---

## The 5 patterns worth stealing

### 1. RLS-first client auth — anon key is public, reads live in edge functions

gstack commits the anon key to the repo. RLS denies every SELECT, so the
key is useless for reads. All reads happen inside edge functions using
`SUPABASE_SERVICE_ROLE_KEY`. This avoids the ".env churn per contributor"
problem, at the cost of making edge functions the only read path.

- Config committed to the repo:
  [`supabase/config.sh`](https://github.com/garrytan/gstack/blob/54d4cde/supabase/config.sh)
  — two lines, URL + publishable key, with a comment explaining why it's safe.
- Service-role key stays out of the repo and is read via `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`
  in each edge function.

**For Lucky:** worth considering for the **anon/publishable** key. The
service-role key stays in `.env` (hooked-protected, per MEMORY.md:21).
The bot already uses a backend service, so pushing reads through edge
functions might be overkill; the value is more on the Prisma side —
client packages don't need the anon key at all if the bot talks to
Postgres via Prisma directly.

### 2. Progressive RLS tightening via migrations, not initial-schema heroics

[`002_tighten_rls.sql`](https://github.com/garrytan/gstack/blob/54d4cde/supabase/migrations/002_tighten_rls.sql)
does the boring, correct thing: keep permissive INSERT policies while old
clients are still POSTing directly to PostgREST, drop SELECT/UPDATE
anon policies entirely, then remove the INSERT policies in a later
migration once new clients have rolled out. Belt-and-suspenders with
`REVOKE SELECT ... FROM anon` on views.

**For Lucky:** the migration order matters more than the final shape.
Don't ship a single mega-migration that locks RLS tight and breaks any
legacy client. Use a sequence:
1. Schema + permissive RLS for current callers.
2. Tighten SELECT/UPDATE first (reads are forgiving — errors surface quickly).
3. Tighten INSERT last, once every writer is proven.

### 3. Column-level GRANT, not just RLS

The cleanest pattern in the repo:
[`003_installations_upsert_policy.sql`](https://github.com/garrytan/gstack/blob/54d4cde/supabase/migrations/003_installations_upsert_policy.sql).

RLS alone is row-scoped; it can't say "you may update `last_seen` but not
`created_at`". The fix is Postgres column-level privileges:

```sql
CREATE POLICY "anon_update_tracking" ON installations
  FOR UPDATE USING (true) WITH CHECK (true);

REVOKE UPDATE ON installations FROM anon;
GRANT UPDATE (last_seen, gstack_version, os) ON installations TO anon;
```

The RLS policy gates *which rows* anon can touch; the column GRANT gates
*which columns*. Any UPDATE that touches a non-granted column is rejected
by Postgres at the query layer, before RLS even runs.

**For Lucky:** use this pattern anywhere the Prisma client needs to
touch a "mostly-immutable" row (e.g. `installations`, `guild_settings`,
user records where only a handful of fields should be mutable). Don't
rely on application-side validation alone.

### 4. Edge functions cache aggregated reads server-side

[`supabase/functions/community-pulse/index.ts`](https://github.com/garrytan/gstack/blob/54d4cde/supabase/functions/community-pulse/index.ts)
illustrates a read-path pattern that scales:

- Every incoming request hits a `community_pulse_cache` table first (keyed on
  `id = 1`, singleton row, with RLS denying anon access).
- If the cache entry is < 1 hour old, serve it directly with a
  `Cache-Control: public, max-age=3600` header.
- Otherwise, recompute aggregates (weekly active, top skills, crash
  clusters), write back to the cache table, return.

The cache table itself is RLS-locked — only service-role-key (the edge
function) can read/write it. This turns the DoS vector of "attacker
hammers an expensive aggregate" into a flat cost.

**For Lucky:** the autoplay candidate selector, birthday list queries,
and any dashboard counts are good fits. The current Discord bot has an
in-memory cache inside Node; an edge-function cache is the version that
survives restarts and is shared across bot replicas.

### 5. Deploy-time RLS smoke test

[`supabase/verify-rls.sh`](https://github.com/garrytan/gstack/blob/54d4cde/supabase/verify-rls.sh)
is a 100-line bash script that curls the live REST API with the anon
key and asserts which operations return 401/403 vs 2xx. Run it right
after applying each migration.

It's the kind of test that's trivial to write and catches the one class
of bug nobody writes a real test for: "I thought I revoked that, but
I didn't."

**For Lucky:** add an equivalent `scripts/verify-rls.sh` (or a Jest
integration test against the staging project) to the Supabase
migration PR. Run it in CI against `lucky-staging` after each
migration applies.

---

## What NOT to steal from gstack

- **The telemetry schema itself** (001/004 migrations) — gstack's
  `telemetry_events`, `installations`, `update_checks`, `skill_sequences`
  are product-specific to a CLI tool. Lucky's data model is a
  Discord bot; no direct overlap.
- **The edge-function runtime** — gstack uses Deno. Lucky's backend is
  Node + Prisma. Even if an edge function makes sense for a specific
  read path, the rest of the write path stays in Node-land.
- **The config.sh shell pattern** — it's a `source`-style bash file
  with env-var exports. Lucky's convention is `.env` + `dotenv`. Don't
  introduce a shell-style config.

---

## Concrete next step (if adopting any of this)

Open a task under the active Supabase migration plan to:

1. Decide yes/no on **pattern #3** (column-level GRANT on the
   `installations`/`guild_settings` analog) — this is the highest-value,
   lowest-risk pattern for Lucky.
2. Add a **`scripts/verify-rls.sh`** or equivalent integration test
   (pattern #5) to the migration PR's test plan.
3. Revisit **pattern #4** (edge-function cache) only if a specific
   hot read path is identified; don't retrofit speculatively.

Patterns #1 and #2 are philosophy — useful to know, but the concrete
migration shape in PR #764 already decides them.

---

## License

gstack is MIT-licensed. This document paraphrases patterns and includes
short quoted SQL (≤10 lines) under fair-use / MIT's permissive terms.
Full attribution: © Garry Tan and gstack contributors,
[`garrytan/gstack`](https://github.com/garrytan/gstack).
