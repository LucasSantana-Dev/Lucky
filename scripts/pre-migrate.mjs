/**
 * Pre-migration setup script.
 *
 * Runs BEFORE `prisma migrate deploy` to ensure the database is in a state
 * where Prisma can apply all migrations without errors.
 *
 * Problem being solved: Prisma 7's migration engine may generate SQL that
 * tries to add a FK from `user_sessions.guildId -> guilds(discordId)` and/or
 * `user_sessions.userId -> users(discordId)`.  Those FKs require a unique
 * constraint on the referenced column.  On databases initialised via
 * `db push` (or created before migrations existed) that unique constraint
 * may be absent even though `guilds.discordId` and `users.discordId` are
 * already unique by convention/application logic.
 *
 * This script idempotently adds:
 *   - UNIQUE INDEX on guilds("discordId")
 *   - UNIQUE INDEX on users("discordId")
 *
 * Both operations are wrapped in try/catch so a missing table or a
 * pre-existing constraint never causes the script (or the deployment) to fail.
 */

import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('[pre-migrate] DATABASE_URL not set – skipping pre-migration checks.');
  process.exit(0);
}

const client = new Client({ connectionString: DATABASE_URL });

async function ensureUniqueIndex(tableName, columnName) {
  const indexName = `${tableName}_${columnName}_key`;
  const sql = `CREATE UNIQUE INDEX IF NOT EXISTS "${indexName}" ON "${tableName}"("${columnName}")`;
  try {
    await client.query(sql);
    console.log(`[pre-migrate] Ensured unique index ${indexName}`);
  } catch (err) {
    // Table doesn't exist, column doesn't exist, or another benign reason –
    // log and continue so the deployment is not blocked.
    console.warn(`[pre-migrate] Could not create ${indexName}: ${err.message}`);
  }
}

try {
  await client.connect();
  await ensureUniqueIndex('guilds', 'discordId');
  await ensureUniqueIndex('users', 'discordId');
} catch (err) {
  console.warn(`[pre-migrate] Connection error (non-fatal): ${err.message}`);
} finally {
  await client.end().catch(() => {});
}
