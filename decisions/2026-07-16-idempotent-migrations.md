# Migrations that transform existing objects must be idempotent, verified against a prod-version scratch DB

- **Status:** Accepted
- **Date:** 2026-07-16
- **Tags:** database, prisma, migrations, ci, incident-driven

## Context

The `support_session_status_enum` migration (#1806/#1834) failed in production **twice** across releases 2.35.1 and 2.35.2, wedging all prod migrations each time (Prisma P3018):

1. **2.35.1** — `ALTER COLUMN status TYPE enum` re-validated the partial index `support_sessions_one_open_per_user WHERE status = 'open'`; its text-literal predicate became `SupportSessionStatus = text` → `42883 operator does not exist`.
2. **2.35.2** (after #1838 dropped/recreated the partial index) — failed at `DROP CONSTRAINT support_sessions_status_check` with `42704 does not exist`.

The second failure exposed the real class defect: **`prisma migrate deploy` does not wrap a migration file in a transaction** (per-statement autocommit; SQL Server is Prisma's only wrapped dialect — [discussion #3774](https://github.com/prisma/prisma/discussions/3774)). So the *first* failed run had already committed `DROP CONSTRAINT` + `CREATE TYPE` before it errored, leaving prod in a **partial state**. #1838 assumed a clean pre-migration state and could not re-run against that residue.

Two verification gaps let this ship: (a) the fix was tested only against a **clean** migration chain, never the actual partial prod state; (b) there is no CI step that runs `migrate deploy` against a real Postgres, so migration-only SQL defects (partial indexes aren't expressible in `schema.prisma`, so Prisma's drift check never sees them) are invisible until prod.

## Decision

**Any migration that transforms existing columns, constraints, indexes, or types must be authored idempotent** — safe to re-run against a partially-applied state — using per-statement guards:

- `DROP ... IF EXISTS` for drops.
- `CREATE TYPE` via `DO $$ BEGIN CREATE TYPE ...; EXCEPTION WHEN duplicate_object THEN NULL; END $$;` (Postgres has no `IF NOT EXISTS` for types).
- `CREATE INDEX IF NOT EXISTS` / drop-then-create where the drop precedes in the same file.
- Guard `ALTER COLUMN ... TYPE` re-application where the column may already be the target type.

**We do NOT rely on transaction wrapping.** Prisma does not wrap migrations, and an explicit in-file `BEGIN/COMMIT` (a) would be omitted by Prisma-*generated* migrations, and (b) has an unverified interaction with Prisma's own `_prisma_migrations` bookkeeping. Idempotency is strictly stronger for recovery: it converges from any partial state, whereas a wrapper merely rolls back to the partial state and still needs guards to re-run.

**Prevention is enforced in CI, not by author discipline alone:** a gate applies the full migration chain (and, where feasible, replays known partial states) against a **Postgres pinned to the production major version** (currently 18) on a scratch DB. This catches partial-apply and non-idempotency defects — and any migration-only SQL the Prisma drift check can't see — before merge. (Tracked as the prevention follow-up in #1837.)

## Alternatives considered

- **Explicit `BEGIN;/COMMIT;` transaction wrapper per migration** — rejected as the *primary* mechanism: Prisma-generated migrations omit it; `_prisma_migrations` interaction is only medium-confidence; and it does not by itself make a re-run against an existing-enum state succeed (still needs guards). Allowed as optional belt-and-suspenders where an author wants atomicity, but never a substitute for idempotency.
- **Manual prod state reconciliation, keep migrations clean-state** — rejected: fragile, manual, per-incident, and re-introduces the same wedge risk on the next surprise state.
- **New forward migration from the current partial state** — rejected: a "from partial state" migration breaks on clean/staging DBs, which are in a different state; it collapses into idempotent guards anyway, with a messier history.

## Consequences

- **Positive:** migrations recover from any partial-apply without manual DB surgery; a whole class of prod-wedge incidents is caught in CI; recovery from a wedged state is `migrate resolve --rolled-back` + redeploy, no hand-editing prod.
- **Negative:** slightly more verbose migration SQL; the CI gate adds a Postgres-container step (~seconds) to the pipeline; authors must remember the `DO`-block idiom for enum types (mitigated by the CI gate catching omissions).
- **Neutral:** hand-authored/edited migrations are already common here (partial indexes, CHECK constraints not expressible in `schema.prisma`), so idempotency guards fit existing practice.

## Revisit when

- Prisma ships transactional `migrate deploy` for PostgreSQL (would make atomicity the default and reduce the idempotency burden) — re-evaluate whether guards are still required.
- The production Postgres major version changes — re-pin the CI gate's Postgres image to match (behaviour like index-predicate re-validation is version-sensitive).
- The CI scratch-DB gate proves insufficient (a migration defect still reaches prod) — escalate to also replaying captured prod schema snapshots, not just the clean chain.
