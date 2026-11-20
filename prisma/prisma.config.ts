import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma CLI (migrate, db push, etc.) talks to the DB through this URL.
// For Supabase deployments this MUST be the *direct* (non-pooled) URL —
// the pgBouncer session/transaction pooler cannot open shadow databases.
// The runtime Prisma client uses DATABASE_URL via the PrismaPg adapter
// in packages/shared/src/utils/database/prismaClient.ts.
//
// We fall back to DATABASE_URL when DIRECT_URL is unset so existing local
// docker-compose dev (single Postgres, one URL) keeps working unchanged.
// Supabase deployments should set both.
//
// `prisma generate` needs a syntactically valid URL but never connects, so
// the final fallback is a local placeholder. It lives here, not in the npm
// script, because inline `VAR=value cmd` env syntax does not run under
// Windows cmd.exe (#2937).
export default defineConfig({
    schema: 'schema.prisma',
    migrations: {
        path: 'migrations',
    },
    datasource: {
        url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
    },
})
