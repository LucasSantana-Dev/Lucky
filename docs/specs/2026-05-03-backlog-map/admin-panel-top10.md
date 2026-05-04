# Admin Panel — Top 10 Tracked Items (2026-05-03)

Derived from `.claude/plans/backlog-2026-05-03-admin-panel.md`.

---

## Critical Path

```
Fix stale 409 test → SonarCloud fix → PR #800 merges → PR #801 rebases
Run DB migration + Restart container → Admin panel functional → Manual QA → PR #801 merges
```

---

## Tracked Items

### 1. Restart backend container [DEPLOY] — XS
**Status**: Pending
`DEVELOPER_USER_IDS=282294772570521600` written to `.env` but container not restarted. All admin routes return 403 for the developer until this runs.
```
docker compose restart lucky-backend
```

---

### 2. Run DB migration for `global_feature_toggles` [DEPLOY] — S
**Status**: Pending
`prisma/migrations/20260504000000_add_global_feature_toggles/migration.sql` exists but not applied on homelab. Toggle writes will throw at runtime.
```
npx prisma migrate deploy
```
**Risk**: Hand-authored migration — verify checksum matches Prisma's expectation.

---

### 3. Fix stale 409 test in `toggles.test.ts` [BUG] — S
**Status**: Pending
`packages/backend/tests/integration/routes/toggles.test.ts:~242` asserts 409 for `POST /api/toggles/global/:name`. Route now returns 200 after DB write.
- Update assertion to 200
- Mock `featureToggleService.setGlobalFeatureToggle`
- Add `setGlobalFeatureToggle` to `@lucky/shared/services` mock

---

### 4. Fix SonarCloud failures on PR #800 and PR #801 [CI] — M
**Status**: Blocking merge
Both PRs blocked by SonarCloud Quality Gate FAILURE.
```sh
gh api /repos/vsantana-org/lucky/check-runs?ref=<sha>
```
Common causes: missing coverage, code smells, duplications.

---

### 5. Apply `writeLimiter` to `POST /api/toggles/global/:name` [SECURITY] — S
**Status**: Pending
Admin toggle writes only covered by `apiLimiter` (100/min). Should use `writeLimiter` (30/min).
- `packages/backend/src/routes/index.ts` — add `app.use('/api/toggles/global', writeLimiter)` after `requireAdmin` guard.

---

### 6. Integration tests for admin routes [TEST] — M
**Status**: Pending (zero coverage)
New file: `packages/backend/tests/integration/routes/admin.test.ts`
- `GET /api/admin/guilds` → 401 (no auth), 403 (non-admin), 200 (admin)
- Bot client unavailable → 200 with `{ guilds: [] }`

---

### 7. Unit tests for `requireAdmin` middleware [TEST] — S
**Status**: Pending (zero coverage)
New file: `packages/backend/tests/unit/middleware/requireAdmin.test.ts`
- Missing `userId` → 401
- Non-developer `userId` → 403
- Valid developer `userId` → `next()` called

---

### 8. Remove orphaned server-toggle frontend code [CLEANUP] — M
**Status**: Pending
Files with dead code after per-server toggle removal:
- `packages/frontend/src/stores/featuresStore.ts` — `fetchServerToggles`, `updateServerToggle`, `getServerToggles`
- `packages/frontend/src/hooks/useFeatures.ts` — `handleServerToggle`, server toggle effects
- `packages/frontend/src/services/api.ts` — `features.getServerToggles`, `features.updateServerToggle`
- `packages/frontend/src/components/Features/ServerTogglesSection.tsx` — delete entire file

---

### 9. Verify manual migration checksum [DEBT] — S
**Status**: Pending
`migration.sql` was hand-authored. `prisma migrate deploy` may reject it if checksum doesn't match.
- Compare against `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma` output.

---

### 10. Document admin panel setup in README [DOCS] — S
**Status**: Pending
New contributors won't know to:
1. Set `DEVELOPER_USER_IDS` env var with their Discord user ID
2. Run `prisma migrate deploy` for the `global_feature_toggles` table
Add "Admin Panel setup" section to `packages/backend/README.md` or root `README.md`.
