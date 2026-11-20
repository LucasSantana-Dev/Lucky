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
// for that command alone a local placeholder is used. It lives here, not in
// the npm script, because inline `VAR=value cmd` env syntax does not run under
// Windows cmd.exe (#2937). Migrate and other database commands still get an
// empty URL when none is set, so they fail instead of reaching a local server.
const isGenerate = process.argv.slice(2).includes('generate')
const placeholderUrl = 'postgresql://localhost:5432/postgres'

export default defineConfig({
    schema: 'schema.prisma',
    migrations: {
        path: 'migrations',
    },
    datasource: {
        url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? (isGenerate ? placeholderUrl : ''),
    },
})
