---
name: mcp-docs-search
description: Use MCP tools for docs lookup and web search in Lucky. Use when needing up-to-date docs, APIs, or best practices.
---

# MCP Docs & Search (Lucky)

## When to use

- Needing current docs for Discord.js, Discord Player, Prisma, React, Vite, Tailwind, Express, TypeScript, Zod
- Searching for APIs, errors, or best practices
- Multi-step reasoning or architecture decisions

## Preferred MCPs

| Task                 | MCP                                                                 | Use                                             |
| -------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| Library docs         | **user-Context7**                                                   | Discord.js, Prisma, Node, React, Tailwind, etc. |
| Web search           | **user-tavily**                                                     | APIs, errors, best practices, tutorials         |
| Multi-step reasoning | **user-sequential-thinking**                                        | Architecture, refactors, migration steps        |
| GitHub               | **user-GitHub**                                                     | Issues, PRs, repo metadata                      |
| Browser/E2E          | **user-playwright**, **cursor-ide-browser**, **user-browser-tools** | E2E tests, UI verification                      |
| UI ideas             | **user-v0**, **user-@magicuidesign/mcp**                            | Reference only; adapt to repo                   |
| Cloudflare           | **user-cloudflare-observability**, **user-cloudflare-bindings**     | Only if Lucky is on Cloudflare Workers          |

## Use when needed (not default)

- **radar_search**, **mcp-gateway**, **user-desktop-commander**, **user-apify-dribbble**, **MCP_DOCKER**, **curl**: Only when the task clearly requires them (e.g. Docker API, desktop automation, scraping).
- **user-minecraft**, **composio**: Not used for Lucky unless explicitly required.

## Conventions

- Prefer Context7 for official library docs before assuming API behavior.
- Use Tavily for errors, version-specific notes, or when Context7 doesn’t cover the topic.
- Don’t force MCPs; use the one that fits the task.

## OpenCode-specific guidance

- For OpenCode plugin, command, skill, or MCP configuration work, prefer official OpenCode docs first.
- Prefer local SDK and type inspection before broad web search when authoring OpenCode plugins or config.
- Use the official OpenCode ecosystem and community plugin index when evaluating third-party plugins.
- Treat community plugin marketing pages as discovery only; confirm install syntax from official docs or the plugin repository before wiring it into Lucky.
