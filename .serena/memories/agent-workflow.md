# LukBot — Agent Workflow

## Session Start Protocol

When starting a new session on LukBot:

1. Run `activate_project` for this project in Serena
2. Run `list_memories` to load all project context
3. Check `git status` and `git log --oneline -5` to see recent changes
4. Check `.serena/memories/current-state.md` for build status
5. Check `.serena/memories/next-priorities.md` for what to work on next

## Verification Before Any Claim of Completion

Always run the full verify sequence before claiming work is done:

```bash
npm run lint && npm run type:check && npm run build && npm run test
```

Individual commands:

```bash
npm run lint          # ESLint across all packages
npm run type:check    # TypeScript type checking
npm run build         # Build all packages (shared → bot → backend → frontend)
npm run test          # Jest tests (packages/backend)
npm run build:frontend  # Frontend only if frontend changed
```

## Skills to Use by Task

| Task                                 | Skill                                          |
| ------------------------------------ | ---------------------------------------------- |
| Any bug or unexpected behavior       | `.agent-skills/systematic-debugging`           |
| Implementing a feature               | `.agent-skills/test-driven-development`        |
| Before claiming work done            | `.agent-skills/verification-before-completion` |
| Before implementing a new feature    | `.agent-skills/brainstorming`                  |
| Before merging / after major feature | `.agent-skills/requesting-code-review`         |
| Frontend React components            | `.agent-skills/vercel-react-best-practices`    |
| Frontend UI review                   | `.agent-skills/web-design-guidelines`          |
| Express routes / backend services    | `.agent-skills/nodejs-backend-patterns`        |
| TypeScript types / removing `as any` | `.agent-skills/typescript-advanced-types`      |
| Prisma schema changes                | `.agent-skills/database-migration`             |
| Add slash command                    | `.cursor/skills/discord-commands`              |
| Music/queue/player                   | `.cursor/skills/music-queue-player`            |
| Schema, migrations, DB/Redis         | `.cursor/skills/prisma-redis-lukbot`           |
| Docker, local dev                    | `.cursor/skills/lukbot-docker-dev`             |
| Frontend (React/Vite/Tailwind)       | `.cursor/skills/frontend-react-vite`           |
| Backend (Express API)                | `.cursor/skills/backend-express`               |
| E2E tests, Playwright                | `.cursor/skills/e2e-playwright`                |
| Docs lookup, web search              | `.cursor/skills/mcp-docs-search`               |

## Commit Convention

Angular-style commits. Multiple small commits by scope:

- `feat(embed): implement EmbedBuilderService`
- `fix(automod): align checkSpam signature with tests`
- `chore(db): add useCount to EmbedTemplate schema`
- `test(embed): re-enable EmbedBuilderService tests`

## Doc Governance

Never create task-specific docs in repo root or `docs/`. Allowed root .md files: README, CHANGELOG, CONTRIBUTING, AGENTS.md, ARCHITECTURE, SECURITY.

Task completion info → CHANGELOG.md or these Serena memories.

## Code Standards

- Functions < 50 lines
- Files < 250 lines (ESLint enforced)
- No hardcoded secrets, IPs, or ports
- No speculative features / premature abstraction
- No comments unless asked — code should be clear from names
- Use `errorLog` from `@lukbot/shared/utils` for all error logging

## MCP Tools Available

| MCP                              | Use for                                           |
| -------------------------------- | ------------------------------------------------- |
| user-filesystem                  | Read/write repo files                             |
| user-GitHub                      | Issues, PRs, repo metadata                        |
| user-Context7                    | Up-to-date docs (Discord.js, Prisma, React, etc.) |
| user-tavily                      | Web search for APIs, errors, best practices       |
| user-playwright / user-puppeteer | E2E/browser tests                                 |
