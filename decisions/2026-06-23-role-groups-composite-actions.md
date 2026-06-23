# ADR: Role Groups Composite Actions & Concurrency Hardening

**Date:** 2026-06-23  
**Status:** Accepted  
**Scope:** Role Groups service (feat/role-groups PR #1544)

## Decision

### Shipped (v2.21.0+)

1. **IDOR Protection (A1, A2):** All role group queries now require guild ownership verification. `addRoleToGroup` now signature-checks `guildId`; `createRoleGroup` rejects `fromMessageId` from other guilds. Integration tests added.
2. **Feature-Breaking Validation (B1):** Schema fixed to accept CUID message IDs (not Discord snowflakes). Existing tests pass.
3. **Tie-Breaking Correctness (C1):** `seedStyleFromMessage` now correctly defaults to Primary on any non-Primary tie. Test updated to exercise real Secondary×1 + Danger×1 case.
4. **Type Safety (D):** All `any` types replaced with Prisma model types (`RoleGroupModel`, `ReactionRoleMappingModel`). Lint reports 0 errors (from 12).
5. **Test Hygiene (E1):** `process.env.DISCORD_TOKEN` now restored after each test suite (afterAll hook).
6. **UX (E2):** Error state cleared before retry in `handleCreateRoleGroup`, preventing stale banners.
7. **Transaction Atomicity (F1):** `createRoleGroup` link operation wrapped in `prisma.$transaction` with conditional `updateMany` to detect race and reject if message already grouped during transaction.

### Deferred (v2.2 post-launch)

**F2: Concurrency Guard for `addRoleToMessage` Appends**

- Current design: guard checks `length >= 25` but concurrent appends can both pass, then both insert.
- Symptom: Message ends up with >25 buttons.
- Fix: Wrap in transaction + final constraint OR DB unique on (messageId, sequence).
- Opened GitHub issue #1558 (label: `ready-for-agent`).
- Priority: v2.2; does not block launch.

## Also Filed

- **Issue #1559:** CI lint gate reports green despite 12 type-aware errors in backend (type safety gate gap).

## Test Coverage

- New IDOR tests: `createRoleGroup` rejects cross-guild message, `addRoleToGroup` rejects cross-guild group.
- Tie-breaking test: real Secondary+Danger tie.
- Concurrency (transaction): conditional updateMany validates link atomicity.

## References

- Service: `packages/backend/src/services/RoleGroupService.ts`
- Routes: `packages/backend/src/routes/roleGroups.ts`
- Schema: `packages/backend/src/schemas/management.ts`
- Tests: `packages/backend/tests/unit/services/RoleGroupService.test.ts`, `packages/backend/tests/integration/routes/roleGroups.test.ts`
- Frontend: `packages/frontend/src/pages/ReactionRoles.tsx`
