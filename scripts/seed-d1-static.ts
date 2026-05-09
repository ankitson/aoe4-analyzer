/**
 * Seed static unit data into Cloudflare D1.
 *
 * Reads the already-downloaded static/unit-data/*.json files and inserts
 * into D1 via the REST API. Same data that fetch-static.ts puts into
 * local SQLite — just targeted at the remote D1 database instead.
 *
 * Usage:
 *   npx tsx scripts/seed-d1-static.ts
 *
 * Required environment variables:
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 */

import fs from 'fs';
import path from 'path';
import { createD1HttpPipelineDb } from '../packages/core/src/db/d1-http';

const STATIC_DIR = path.resolve(__dirname, '..', 'static', 'unit-data');

// Same alias table as fetch-static.ts
const PBGID_ALIASES: {
  observedPbgid: number;
  canonicalPbgid: number | null;
  canonicalCatalog: string;
  customToken: string | null;
}[] = [
  { observedPbgid: 5000071,  canonicalPbgid: 5000070,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2150983,  canonicalPbgid: 2124341,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2145966,  canonicalPbgid: 2127064,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2143513,  canonicalPbgid: 2143512,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2143515,  canonicalPbgid: 2127061,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2145967,  canonicalPbgid: 2127064,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2143516,  canonicalPbgid: 2127061,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2141247,  canonicalPbgid: 2528652,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 5000114,  canonicalPbgid: 5000115,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 5271010,  canonicalPbgid: 129969,   canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 7804932,  canonicalPbgid: 129969,   canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 5000110,  canonicalPbgid: 5000111,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 5000102,  canonicalPbgid: 5000111,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2138205,  canonicalPbgid: 2127064,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2138188,  canonicalPbgid: 2143512,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2138204,  canonicalPbgid: 2127061,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2143839,  canonicalPbgid: 2124339,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2143863,  canonicalPbgid: 4137773,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 2143533,  canonicalPbgid: 2143534,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 9001370,  canonicalPbgid: 9001369,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 9001371,  canonicalPbgid: 9001369,  canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 165135,   canonicalPbgid: 132274,   canonicalCatalog: 'units', customToken: null },
  { observedPbgid: 9000101,  canonicalPbgid: null,      canonicalCatalog: 'custom', customToken: 'turkic_archer' },
  { observedPbgid: 9000103,  canonicalPbgid: null,      canonicalCatalog: 'custom', customToken: 'turkic_archer' },
  { observedPbgid: 2161903,  canonicalPbgid: null,      canonicalCatalog: 'custom', customToken: 'crown_king' },
  { observedPbgid: 2127468,  canonicalPbgid: null,      canonicalCatalog: 'custom', customToken: 'treasure_caravan' },
];

interface Aoe4WorldUnit {
  id: string;
  baseId: string;
  type: string;
  name: string;
  pbgid: number;
  age: number;
  civs: string[];
  classes: string[];
  displayClasses?: string[];
  costs: Record<string, number>;
  producedBy?: string[];
  icon: string;
  hitpoints: number;
  weapons?: unknown[];
  armor?: unknown[];
  description?: string;
  [key: string]: unknown;
}

function loadAllUnits(): Map<string, Aoe4WorldUnit[]> {
  const results = new Map<string, Aoe4WorldUnit[]>();
  const files = fs.readdirSync(STATIC_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const civ = file.replace(/\.json$/, '');
    const data = JSON.parse(fs.readFileSync(path.join(STATIC_DIR, file), 'utf-8'));
    const units = Array.isArray(data) ? data.filter((u: any) => u?.type === 'unit') : [];
    if (units.length > 0) {
      results.set(civ, units);
      console.log(`  ${civ}: ${units.length} units`);
    }
  }

  return results;
}

async function run() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;

  if (!apiToken || !accountId || !databaseId) {
    console.error('Missing required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID');
    process.exit(1);
  }

  const db = createD1HttpPipelineDb({ apiToken, accountId, databaseId });

  // Load unit data from disk
  console.log('=== Loading cached unit data ===');
  const allUnits = loadAllUnits();
  const totalUnits = [...allUnits.values()].reduce((s, u) => s + u.length, 0);
  console.log(`\nTotal: ${totalUnits} units across ${allUnits.size} civs\n`);

  // Insert units (deduplicated)
  console.log('=== Seeding units table ===');
  const seenIds = new Set<string>();
  let unitCount = 0;

  for (const [, units] of allUnits) {
    for (const u of units) {
      if (seenIds.has(u.id)) continue;
      seenIds.add(u.id);

      await db.run(
        `INSERT OR REPLACE INTO units
          (unit_id, base_id, name, pbgid, age, classes, display_classes,
           costs, hitpoints, weapons, armor, civs, produced_by, icon, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.id,
          u.baseId,
          u.name,
          u.pbgid ?? null,
          u.age ?? null,
          JSON.stringify(u.classes ?? []),
          u.displayClasses ? JSON.stringify(u.displayClasses) : null,
          JSON.stringify(u.costs ?? {}),
          u.hitpoints ?? null,
          u.weapons ? JSON.stringify(u.weapons) : null,
          u.armor ? JSON.stringify(u.armor) : null,
          JSON.stringify(u.civs ?? []),
          u.producedBy ? JSON.stringify(u.producedBy) : null,
          u.icon ?? null,
          u.description ?? null,
        ],
      );
      unitCount++;

      if (unitCount % 50 === 0) {
        process.stdout.write(`  ${unitCount} units inserted...\r`);
      }
    }
  }
  console.log(`  units table: ${unitCount} rows`);

  // Insert pbgid aliases
  console.log('=== Seeding pbgid_aliases table ===');
  for (const a of PBGID_ALIASES) {
    await db.run(
      `INSERT OR REPLACE INTO pbgid_aliases
        (observed_pbgid, canonical_catalog, canonical_pbgid, custom_token)
      VALUES (?, ?, ?, ?)`,
      [a.observedPbgid, a.canonicalCatalog, a.canonicalPbgid, a.customToken],
    );
  }
  console.log(`  pbgid_aliases table: ${PBGID_ALIASES.length} rows`);

  // Insert unit_lines
  console.log('=== Seeding unit_lines table ===');
  const seenLineKeys = new Set<string>();
  let lineCount = 0;

  for (const [, units] of allUnits) {
    for (const u of units) {
      const iconKey = u.id.replace(/-/g, '_');
      if (seenLineKeys.has(iconKey)) continue;
      seenLineKeys.add(iconKey);

      const lineKey = u.baseId.replace(/-/g, '_');
      await db.run(
        `INSERT OR REPLACE INTO unit_lines (icon_key, line_key, label) VALUES (?, ?, ?)`,
        [iconKey, lineKey, u.name],
      );
      lineCount++;
    }
  }
  console.log(`  unit_lines table: ${lineCount} rows`);

  // Insert line_upgrades
  console.log('=== Seeding line_upgrades table ===');
  const seenUpgradeKeys = new Set<string>();
  let upgradeCount = 0;

  for (const [, units] of allUnits) {
    for (const u of units) {
      const iconKey = u.id.replace(/-/g, '_');
      const lineKey = u.baseId.replace(/-/g, '_');
      const compositeKey = `${iconKey}|${lineKey}`;
      if (seenUpgradeKeys.has(compositeKey)) continue;
      seenUpgradeKeys.add(compositeKey);

      await db.run(
        `INSERT OR REPLACE INTO line_upgrades (upgrade_icon_key, line_key, tier) VALUES (?, ?, ?)`,
        [iconKey, lineKey, u.age ?? 1],
      );
      upgradeCount++;
    }
  }
  console.log(`  line_upgrades table: ${upgradeCount} rows`);

  // Verify
  console.log('\n=== Verification ===');
  const count = await db.getOne<{ c: number }>('SELECT count(*) as c FROM units');
  console.log(`  Units in D1: ${count?.c ?? 'error'}`);

  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
