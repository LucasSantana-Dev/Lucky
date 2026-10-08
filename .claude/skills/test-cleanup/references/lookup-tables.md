# Proportionality Lookup Tables

## Efficient Test Count by App Type

Map source LOC to the proportionality table to set your count target:

| App type                  | Source LOC | Efficient test count |
| ------------------------- | ---------- | -------------------- |
| Browser extension         | ~3k        | 40–150               |
| CLI tool                  | ~2k        | 30–120               |
| REST API (≤20 routes)     | ~4k        | 80–250               |
| Full-stack app            | ~15k       | 200–600              |
| Large multi-subsystem app | 15k–50k    | 500–1500             |

The large multi-subsystem row covers services with many distinct feature modules. Treat
the count as a ceiling, not a floor: aggressive deletion below the lower bound should
only happen if integration coverage stays and the suite shrinks organically.

## Coverage Exclusion Patterns

Use these patterns before lowering the coverage gate. Excluding generated or logic-free files is cleaner than lowering the threshold, because the threshold still enforces real coverage on real code.

```ts
// jest.config.ts / vitest.config.ts
coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__generated__/', // generated GraphQL or Prisma types
    '/src/types/', // pure TS interfaces and enums
    '/src/constants/', // pure constants with no logic
    '/src/migrations/', // DB migrations
]
```
