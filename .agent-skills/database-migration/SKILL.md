---
name: database-migration
description: Master database schema and data migrations with Prisma, including rollback strategies. Use when changing prisma/schema.prisma or running migrations.
source: https://github.com/wshobson/agents
---

# Database Migration

Master database schema migrations with Prisma for Nexus.

## When to Use This Skill

- Changing `prisma/schema.prisma`
- Adding new models or columns
- Running `npm run db:migrate`
- Zero-downtime schema changes

## Nexus Migration Commands

```bash
npm run db:generate    # Regenerate Prisma client after schema changes
npm run db:migrate     # Create and apply migration (dev)
npm run db:deploy      # Apply migrations (production)
npm run db:status      # Check migration status
npm run db:reset       # Reset database (DEV ONLY - destroys data)
```

## Prisma Migration Workflow

1. Edit `prisma/schema.prisma`
2. Run `npm run db:migrate` — creates file in `prisma/migrations/` and applies it
3. Run `npm run db:generate` — regenerates the Prisma client
4. Run `npm run build:shared` — rebuild shared package with new types

## Safe Migration Patterns

**Adding a column with default (SAFE — zero downtime):**

```prisma
model EmbedTemplate {
  useCount Int @default(0)  // ← safe to add
}
```

**Adding a required column (UNSAFE — use staged approach):**

```
Step 1: Add column as optional (String?)
Step 2: Backfill data
Step 3: Make required (String) in separate migration
```

## Nexus Schema Location

- Schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- Generated client: `packages/shared/src/generated/prisma/`

## Current Active Issue

`EmbedTemplate` model is missing `useCount Int @default(0)`. The bot command `embed.ts` and tests reference it. Add it, then run:

```bash
npm run db:migrate -- --name add_usecount_to_embed_templates
npm run db:generate
```

## Best Practices

1. Always provide rollback — every forward migration needs a down
2. Test migrations on staging first
3. Backup before production migrations
4. Small changes — break into small, incremental steps
5. Document why the change is needed in migration name
