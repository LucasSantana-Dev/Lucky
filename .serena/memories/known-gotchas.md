# LukBot — Known Gotchas

## 1. Prisma `as any` Workaround

**Symptom**: TypeScript can't resolve types from `@prisma/client` (e.g. `ModerationCase`, `AutoModSettings`).

**Root cause**: Prisma 6 + TypeScript 5 module resolution edge case. The type re-exports don't work correctly with ES module resolution.

**Current workaround** (in all services):

```typescript
const prisma = getPrismaClient() as any
// Plus inline type definitions at top of each service file
export type ModerationCase = { id: string; ... }
```

**Long-term fix** (not yet applied):

1. Check `tsconfig.json` `moduleResolution` setting — try `"bundler"` or `"node16"`
2. Import types from `packages/shared/src/generated/prisma/` (the actual generated client)
3. Remove `as any` and inline types once imports work

**Impact**: Runtime is 100% correct. TypeScript types are weakened. Not a blocker.

## 2. Jest ESM Mode

All tests use `jest.unstable_mockModule()` (not `jest.mock()`). This is required for ES modules.

```typescript
jest.unstable_mockModule('@lukbot/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    prisma: mockPrisma,
}))
```

The module import must come AFTER the mock registration, inside `beforeAll`:

```typescript
beforeAll(async () => {
    const module = await import('@lukbot/shared/services')
    // use module.SomeService
})
```

## 3. Test Files with Disabled Tests (early `return`)

Two test files are currently broken due to mismatches between service and test expectations:

- `packages/backend/tests/unit/services/EmbedBuilderService.test.ts` — disabled via `return` in `beforeAll` (service missing)
- `packages/backend/tests/unit/services/AutoModService.test.ts` — disabled via `return` in `beforeAll` (signature mismatch)

These tests must be fixed alongside the service implementations.

## 4. ESLint Max Lines Rule

Files must be under **250 lines**. This is actively enforced. When a service grows large, extract helpers:

- Pattern: `ServiceName.ts` + `serviceNameHelpers.ts` (or `serviceNameOtherConcern.ts`)
- Examples: `ModerationService.ts` + `moderationSettings.ts`, `ServerLogService.ts` + `serverLogHelpers.ts`

## 5. EmbedTemplate Schema vs Bot Command Expectations

The `EmbedTemplate` Prisma model stores fields individually (`title`, `description`, `color`, `footer`, `thumbnail`, `image`, `fields`). But `embed.ts` currently uses `template.embedData as any`.

The fix (planned): Update `embed.ts` to build a Discord `EmbedBuilder` from the individual fields, not from a single blob. Also add `useCount Int @default(0)` to the schema.

## 6. `scripts/skills.sh` is Superpowers CLI only

`scripts/skills.sh` wraps the Codex/Superpowers CLI at `~/.codex/superpowers/`. It is NOT the skills.sh ecosystem CLI.

The skills.sh ecosystem skills are installed at `.agent-skills/` in the repo root.

## 7. Xcode License on macOS

`git clone` may fail with "You have not agreed to the Xcode license agreements." This blocks `npx skills add`. Workaround: fetch SKILL.md files directly from GitHub API and write them manually.

## 8. `.cursor/` gitignore exception

`.cursor/` is gitignored EXCEPT for:

- `.cursor/hooks.json`
- `.cursor/hooks/*.sh`
- `.cursor/rules/**`
- `.cursor/skills/**`
- `.cursor/COMMANDS.md`
