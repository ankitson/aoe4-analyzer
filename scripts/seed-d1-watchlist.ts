/**
 * Seed watchlist from local SQLite into Cloudflare D1.
 *
 * Reads all active watchlist entries from data/local.db and inserts
 * them into the remote D1 database.
 *
 * Usage:
 *   npx tsx scripts/seed-d1-watchlist.ts           # sync active players only
 *   npx tsx scripts/seed-d1-watchlist.ts --all      # sync all (including inactive opponents)
 *
 * Required environment variables:
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 */

import Database from 'better-sqlite3';
import path from 'path';
import { createD1HttpPipelineDb } from '../packages/core/src/db/d1-http';

const DB_PATH = path.resolve(__dirname, '..', 'data', 'local.db');

interface WatchlistRow {
  profile_id: number;
  name: string;
  is_pro: number;
  active: number;
}

async function run() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;

  if (!apiToken || !accountId || !databaseId) {
    console.error('Missing required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID');
    process.exit(1);
  }

  const syncAll = process.argv.includes('--all');

  // Read from local SQLite
  const local = new Database(DB_PATH, { readonly: true });
  const query = syncAll
    ? 'SELECT profile_id, name, is_pro, active FROM watchlist'
    : 'SELECT profile_id, name, is_pro, active FROM watchlist WHERE active = 1';
  const rows = local.prepare(query).all() as WatchlistRow[];
  local.close();

  console.log(`Found ${rows.length} ${syncAll ? 'total' : 'active'} watchlist entries in local DB`);

  if (rows.length === 0) {
    console.log('Nothing to seed.');
    return;
  }

  // Write to D1
  const d1 = createD1HttpPipelineDb({ apiToken, accountId, databaseId });

  for (const row of rows) {
    await d1.run(
      `INSERT OR IGNORE INTO watchlist (profile_id, name, is_pro, active) VALUES (?, ?, ?, ?)`,
      [row.profile_id, row.name, row.is_pro, row.active],
    );
    console.log(`  ${row.name} (${row.profile_id}) — is_pro=${row.is_pro}, active=${row.active}`);
  }

  // Verify
  const count = await d1.getOne<{ c: number }>('SELECT count(*) as c FROM watchlist');
  console.log(`\nWatchlist in D1: ${count?.c ?? 'error'} entries`);
  console.log('Done.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
