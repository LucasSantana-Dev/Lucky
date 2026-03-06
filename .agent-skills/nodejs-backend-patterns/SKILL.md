---
name: nodejs-backend-patterns
description: Build production-ready Node.js backend services with Express, middleware patterns, error handling, and API design best practices. Use when creating Express routes, middleware, or services in packages/backend.
source: https://github.com/wshobson/agents
---

# Node.js Backend Patterns

Comprehensive guidance for building scalable, maintainable, production-ready Node.js backend applications.

## When to Use This Skill

- Building REST API routes in `packages/backend/src/routes/`
- Creating or modifying Express middleware in `packages/backend/src/middleware/`
- Designing new backend service patterns
- Setting up error handling
- Implementing authentication/authorization

## LukBot Backend Structure

```
packages/backend/src/
├── routes/          # Express route handlers
│   ├── moderation.ts
│   ├── management.ts
│   ├── managementEmbeds.ts
│   ├── managementAutoMessages.ts
│   └── music.ts
├── middleware/      # auth.ts, requireAuth
├── services/        # (use @lukbot/shared/services)
└── index.ts         # App entry point
```

## Key Patterns in This Codebase

**Route pattern:**

```typescript
import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { someService } from '@lukbot/shared/services'
import { errorLog } from '@lukbot/shared/utils'

export function setupSomeRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/items',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = req.params.guildId
                const items = await someService.getItems(guildId)
                res.json({ items })
            } catch (error) {
                errorLog({ message: 'Error fetching items:', error })
                res.status(500).json({ error: 'Failed to fetch items' })
            }
        },
    )
}
```

**Error handling:** Use `errorLog` from `@lukbot/shared/utils`. Return structured `{ error: 'message' }` JSON.

**Auth:** All protected routes use `requireAuth` middleware from `../middleware/auth`.

## Best Practices

1. Use TypeScript strict mode — no `any` unless explicitly required (Prisma workaround exception)
2. Return early from route handlers on validation failures
3. Log errors with `errorLog({ message, error })`
4. Keep route handlers under 50 lines — extract to service layer
5. Functions under 50 lines, cyclomatic complexity under 10
