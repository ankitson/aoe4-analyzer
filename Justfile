# aoe4-analyzer – common commands
# Usage: just <recipe>

# Ports: system blocks 3001, so we use 8080 for API and 5173 for web
API_PORT := "8080"

# Install dependencies (run once after clone)
install:
    pnpm install
    pnpm rebuild better-sqlite3

# Initialize / update the local SQLite database schema
migrate:
    pnpm migrate

# Fetch unit catalog from aoe4world (one-time; populates units/lines/aliases tables)
fetch-static:
    npx tsx scripts/fetch-static.ts

# Seed watchlist with top-N ladder players (default 10)
import-players n="10":
    npx tsx scripts/import-top-players.ts {{n}}

# Add a single player to the watchlist
# Usage: just ingest-add id=<profileId> name="Player Name"
ingest-add id name:
    pnpm ingest add {{id}} "{{name}}"

# List watchlist players
watchlist:
    pnpm ingest list

# Ingest games for all watched players (or a specific profile ID)
ingest player="":
    #!/usr/bin/env bash
    if [ -n "{{player}}" ]; then
        pnpm ingest run {{player}}
    else
        pnpm ingest run
    fi

# Extract unit events from raw build order data
extract:
    pnpm extract

# Run battle detection and analysis
analyze:
    pnpm analyze

# Start the local API server
dev-api:
    cd packages/api && PORT={{API_PORT}} node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs watch src/index.ts

# Start the frontend dev server (proxies /api to API_PORT)
dev-web:
    cd packages/web && API_PORT={{API_PORT}} npx vite

# Run the full local pipeline from scratch (after migrate + fetch-static)
pipeline: ingest extract analyze

# --- Cloud (Phase 2) ---

# Apply migrations to Cloudflare D1 (requires CLOUDFLARE_API_TOKEN in env)
d1-migrate:
    npx wrangler d1 migrations apply DB --remote

# Seed static unit data into D1
d1-seed-static:
    npx tsx scripts/seed-d1-static.ts

# Seed watchlist into D1
d1-seed-watchlist:
    npx tsx scripts/seed-d1-watchlist.ts

# Trigger the GitHub Actions pipeline manually
gh-run:
    gh workflow run process-games.yml
