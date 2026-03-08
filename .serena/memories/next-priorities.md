# Next Priorities (2026-03-07)

## Completed
- ✅ CI/CD pipeline (GitHub Actions) — already existed
- ✅ EmbedBuilderService — already implemented
- ✅ Prisma type cleanup — removed all `as any` / typePrisma workarounds

## Remaining Work
1. **Clean up dead code**: Remove `prismaHelpers.ts` and update test mocks to not reference it
2. **Remove manual type definitions**: Services that define their own types (ModerationCase, ModerationSettings) can use Prisma generated types
3. **Music player testing**: Discord Player 7.1 integration needs verification
4. **Frontend dashboard**: Connect to backend API, show real server data
5. **Feature flags UI**: Admin panel for feature toggle management
6. **Redis caching layer**: Add caching to frequently-accessed services
