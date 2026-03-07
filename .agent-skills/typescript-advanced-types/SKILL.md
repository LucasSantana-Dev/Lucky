---
name: typescript-advanced-types
description: Master TypeScript's advanced type system. Use when implementing complex type logic, creating reusable type utilities, or eliminating 'as any' casts in the codebase.
source: https://github.com/wshobson/agents
---

# TypeScript Advanced Types

Guidance for TypeScript's advanced type system: generics, conditional types, mapped types, template literals, and utility types.

## When to Use This Skill

- Eliminating `as any` casts (active issue in this codebase with Prisma)
- Building type-safe service interfaces
- Creating reusable type utilities
- Implementing type-safe discriminated unions
- Ensuring compile-time type safety

## Nexus-Specific Context

### The Prisma `as any` Workaround

Currently in `packages/shared/src/services/`, Prisma client is cast:

```typescript
const prisma = getPrismaClient() as any
```

This is a Prisma 6 + TypeScript 5 module resolution issue. The long-term fix is:

1. Ensure `tsconfig.json` has `"moduleResolution": "bundler"` or `"node16"`
2. Import types from `packages/shared/src/generated/prisma/` (the generated client location)
3. Use `import type { PrismaClient } from '../generated/prisma/index.js'`

### Type Patterns Used in This Codebase

**Inline type definitions (current workaround pattern):**

```typescript
// Used when @prisma/client types can't be resolved
export type ModerationCase = {
    id: string
    caseNumber: number
    guildId: string
    // ... etc
}
```

**Discriminated unions for results:**

```typescript
type Result<T> = { success: true; data: T } | { success: false; error: string }
```

**Utility types commonly needed:**

- `Partial<T>` — for update payloads
- `Omit<T, 'id' | 'createdAt' | 'updatedAt'>` — for create inputs
- `Pick<T, 'guildId' | 'type'>` — for filtered queries

## Key Practices

1. Use `unknown` over `any` — enforce type checking
2. Prefer `interface` for object shapes — better error messages
3. Use `type` for unions and complex types
4. Leverage type inference — let TypeScript infer when possible
5. Use strict mode — all strict compiler options enabled
