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
export default defineConfig({
    schema: 'schema.prisma',
    migrations: {
        path: 'migrations',
    },
    datasource: {
        url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
    },
})
