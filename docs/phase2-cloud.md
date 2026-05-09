# Phase 2: Cloudflare D1 + GitHub Actions Setup

## Goal

Get the automated pipeline working in the cloud:
- Cloudflare D1 as the production database (same SQL schema as local SQLite)
- GitHub Actions runs every 2 hours to fetch pending games, extract, and analyze
- The same `scripts/process-pending.ts` script handles it all via D1 HTTP client

## Status: Not yet started

Phase 1 (local SQLite) is complete. This is the next step.

---

## Credentials needed

| Secret | Where to find it | Where it goes |
|--------|-----------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token (use "Edit Cloudflare Workers" template or custom with Account > D1 > Edit) | Local env + GitHub Actions secret |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar on any page | Local env + GitHub Actions secret |
| `CLOUDFLARE_D1_DATABASE_ID` | Already in `wrangler.jsonc`: `a505c4e3-62ee-41fe-8875-79e8d241b745` | Already committed |

---

## Steps

### 2.1 — Verify wrangler auth

```bash
export CLOUDFLARE_API_TOKEN=<token>
export CLOUDFLARE_ACCOUNT_ID=<account_id>
npx wrangler whoami
```

Should print your Cloudflare account name.

### 2.2 — Apply migrations to D1

```bash
npx wrangler d1 migrations apply DB --remote
```

This runs the same 7 SQL files from `packages/core/src/db/migrations/` against the D1 database. Idempotent — safe to re-run.

Verify:
```bash
npx wrangler d1 execute DB --command "SELECT name FROM sqlite_master WHERE type='table'" --remote
```

### 2.3 — Seed static unit data into D1

`scripts/fetch-static.ts` only writes to local SQLite. A new companion script needs to be written:

**`scripts/seed-d1-static.ts`** — reads already-downloaded `static/unit-data/*.json` files and inserts into D1 via `createD1HttpPipelineDb` (from `packages/core/src/db/d1-http.ts`).

The D1 HTTP client and the insertion logic in `fetch-static.ts` can be reused directly. The script should:
1. Read env vars (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`)
2. Create a `D1HttpPipelineDb` instance
3. Run the same `INSERT OR IGNORE` statements that `fetch-static.ts` runs against SQLite

Verify:
```bash
npx wrangler d1 execute DB --command "SELECT count(*) FROM units" --remote
# → should be ~381
```

### 2.4 — Seed watchlist into D1

Two options:

**Option A (simpler):** Extend `scripts/import-top-players.ts` with a `--d1` flag that uses `createD1HttpPipelineDb` instead of `better-sqlite3`.

**Option B:** Write `scripts/seed-d1-watchlist.ts` that reads the local `data/local.db` watchlist table and re-inserts rows into D1.

Either way, the insert SQL is:
```sql
INSERT OR IGNORE INTO watchlist (profile_id, name, is_pro, active) VALUES (?, ?, ?, ?)
```

Verify:
```bash
npx wrangler d1 execute DB --command "SELECT count(*) FROM watchlist" --remote
# → should be 10+
```

### 2.5 — Set GitHub Actions secrets

In the GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | your token |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | `a505c4e3-62ee-41fe-8875-79e8d241b745` |

### 2.6 — Trigger the workflow

```bash
gh workflow run process-games.yml
# or: gh workflow run process-games.yml --field limit=10
```

Or via GitHub UI: Actions → "Process Pending Games" → Run workflow.

The workflow (`scripts/process-pending.ts`) will:
1. Read `pending_jobs` from D1
2. For each pending game: fetch summary from aoe4world, extract unit events, detect battles
3. Write results back to D1
4. Mark jobs done

Verify after first run:
```bash
npx wrangler d1 execute DB --command "SELECT count(*) FROM games" --remote
```

---

## Relevant files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | D1 binding (`DB`) + database ID |
| `packages/core/src/db/d1-http.ts` | D1 REST API client — use this in seeding scripts |
| `packages/core/src/db/pipeline-db.ts` | `createD1HttpPipelineDb()` factory function |
| `scripts/process-pending.ts` | GitHub Actions pipeline — fetch + extract + analyze via D1 HTTP |
| `.github/workflows/process-games.yml` | Scheduled workflow (every 2h), reads CF secrets from repo |
| `scripts/fetch-static.ts` | Reference for how unit data insertion works (adapt for D1) |
| `scripts/import-top-players.ts` | Reference for watchlist insertion (adapt for D1 with `--d1` flag) |

---

## Notes

- The `process-pending.ts` script already handles 429 rate-limit retries (10s, 30s, 60s backoff)
- The `pending_jobs` table (migration 006) is the queue between GitHub Actions runs
- Games discovered by the Cloudflare Jobs Worker go into `pending_jobs`; GitHub Actions drains it
- The `just d1-migrate`, `just d1-seed-static`, `just d1-seed-watchlist`, `just gh-run` Justfile recipes map to these steps
