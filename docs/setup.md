# Local Development Setup

This documents the exact steps taken to get the project running locally end-to-end, including bugs fixed and environment quirks discovered on 2026-05-09. A new Claude instance (or human) should be able to resume from here.

## What was completed (Phase 1)

The full local pipeline was run and verified working:

| Step | Outcome |
|------|---------|
| `pnpm install` | 190 packages, native bindings compiled |
| `pnpm migrate` | 7 migrations applied to `data/local.db` |
| `npx tsx scripts/fetch-static.ts` | 1030 units across 23 civs indexed |
| `pnpm ingest run 8840075` | 32 games downloaded for player `deletejardi` |
| `pnpm extract` | 64 player rows extracted, 630 unit streams parsed |
| `pnpm analyze` | 32 games → 132 battles detected |
| API `GET /api/players` | Returns 10 watchlist players |
| API `GET /api/players/8840075/games` | Returns 32 games with battle counts |
| API `GET /api/games/:id/timeline` | Returns battles + compositions |
| Web `http://localhost:5173` | Vite serves React app, proxy to API works |

---

## Environment quirks

### pnpm not globally installed
pnpm was not on `PATH`. Fix:
```bash
npm install -g pnpm --prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
```
Add the `export` line to `~/.bashrc` to make it permanent.

### Ports 3000–3009 are blocked by the system
The host machine pre-binds ports 3000–3009 (no process visible, kernel-level). The API cannot bind to 3001. **Port 8080 is free and used instead.**

Code changes made to support this:
- `packages/api/src/index.ts` — `PORT` now reads from `process.env.PORT`, defaults to `8080`
- `packages/web/vite.config.ts` — proxy target reads from `process.env.API_PORT`, defaults to `8080`

### better-sqlite3 native bindings
`pnpm-workspace.yaml` had `better-sqlite3: false` in `allowBuilds` (disabled). Fixed to `true`.

Even with `allowBuilds: true`, on first install pnpm may skip the build. If you get `Cannot find module 'better-sqlite3'` or a missing `.node` file:
```bash
pnpm rebuild better-sqlite3
```
The compiled binary lives at:
`node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node`

### API DB path bug (fixed)
`packages/api/src/index.ts` originally used `./data/local.db` (relative path), which broke when run via `pnpm --filter api dev` (executes from `packages/api/`, not repo root). Fixed to use `path.resolve(__dirname, '../../../data/local.db')` via `import.meta.url`.

### Vite proxy target (fixed)
`packages/web/vite.config.ts` was targeting `http://127.0.0.1:8787` (the wrangler dev port), not the local Hono API. Fixed to use `API_PORT` env var.

---

## How to start the dev stack

Use the Justfile (requires [`just`](https://github.com/casey/just)):

```bash
just dev-api   # starts Hono API on :8080
just dev-web   # starts Vite dev server on :5173, proxies /api → :8080
```

Or manually:

```bash
# Terminal 1 — API
cd packages/api
PORT=8080 node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs watch src/index.ts

# Terminal 2 — Web
cd packages/web
API_PORT=8080 npx vite
```

The web app will be at `http://localhost:5173`.

---

## Fresh setup from scratch (in Docker)

If starting in a fresh container with no `node_modules` and no `data/local.db`:

```bash
# 1. Install pnpm (if not available)
npm install -g pnpm --prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"

# 2. Install dependencies + compile native bindings
pnpm install
pnpm rebuild better-sqlite3

# 3. Database
pnpm migrate                              # creates data/local.db (7 migrations)
npx tsx scripts/fetch-static.ts          # populates unit catalog (one-time)

# 4. Seed some players and ingest data
npx tsx scripts/import-top-players.ts 10 # top 10 ladder players
pnpm ingest run                           # fetch their games (~7-10 min, 2s/call)
pnpm extract                              # parse unit events
pnpm analyze                              # detect battles

# 5. Start servers
just dev-api &
just dev-web
```

For a faster first run (single player, ~2 min):
```bash
pnpm ingest run 8840075   # deletejardi, ~32 games
```

---

## Key files modified during setup

| File | What changed |
|------|-------------|
| `pnpm-workspace.yaml` | `better-sqlite3` flipped from `false` → `true` in `allowBuilds`; `sharp`/`workerd`/`esbuild` also set explicitly |
| `packages/api/src/index.ts` | DB path made absolute; `PORT` reads from `process.env.PORT` |
| `packages/web/vite.config.ts` | Proxy target reads from `process.env.API_PORT` (default `8080`) |
| `Justfile` | Created — all common commands, correct ports |

---

## Watchlist and data (as of 2026-05-09)

`data/local.db` contains:
- **10 watched players** (top 10 ladder: deletejardi, EL.loueMT, Beedrill, VES Myriad, M8.Elyona, 泯灭的纯真, ツiby, 夜空空空, 香菇魔女, Wam01)
- **32 games** (ingested for deletejardi / profile 8840075 only — run `pnpm ingest run` to fetch the rest)
- **132 battles** detected across those 32 games

To ingest all 10 players' games:
```bash
pnpm ingest run   # fetches for all active watchlist entries
pnpm extract
pnpm analyze
```

---

## What's next: Phase 2 (Cloudflare D1 + GitHub Actions)

See [`docs/phase2-cloud.md`](./phase2-cloud.md) for the full plan.

Short version — needs from user:
- `CLOUDFLARE_API_TOKEN` (Account > D1 > Edit scope)
- `CLOUDFLARE_ACCOUNT_ID` (visible in Cloudflare dashboard sidebar)
- `CLOUDFLARE_D1_DATABASE_ID` is already in `wrangler.jsonc`: `a505c4e3-62ee-41fe-8875-79e8d241b745`
