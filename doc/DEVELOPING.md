# Developing

This project can run fully in local dev without setting up PostgreSQL manually.

## Deployment Modes

For mode definitions and intended CLI behavior, see `doc/DEPLOYMENT-MODES.md`.

Current implementation status:

- canonical model: `local_trusted` and `authenticated` (with `private/public` exposure)

## Prerequisites

- Node.js 20+
- pnpm 9+

## Start Dev

From repo root:

```sh
pnpm install
pnpm dev
```

This starts:

- API server: `http://localhost:3100`
- UI: served by the API server in dev middleware mode (same origin as API)

Tailscale/private-auth dev mode:

```sh
pnpm dev --tailscale-auth
```

This runs dev as `authenticated/private` and binds the server to `0.0.0.0` for private-network access.

Allow additional private hostnames (for example custom Tailscale hostnames):

```sh
pnpm atototo allowed-hostname dotta-macbook-pro
```

## One-Command Local Run

For a first-time local install, you can bootstrap and run in one command:

```sh
pnpm atototo run
```

`atototo run` does:

1. auto-onboard if config is missing
2. `atototo doctor` with repair enabled
3. starts the server when checks pass

## Docker Quickstart (No local Node install)

Build and run Baton in Docker:

```sh
docker build -t baton-local .
docker run --name baton \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e BATON_HOME=/baton \
  -v "$(pwd)/data/docker-baton:/baton" \
  baton-local
```

Or use Compose:

```sh
docker compose -f docker-compose.quickstart.yml up --build
```

See `doc/DOCKER.md` for API key wiring (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) and persistence details.

## Database in Dev (Auto-Handled)

For local development, leave `DATABASE_URL` unset.
The server will automatically use embedded PostgreSQL and persist data at:

- `~/.baton/instances/default/db`

Override home and instance:

```sh
BATON_HOME=/custom/path BATON_INSTANCE_ID=dev pnpm atototo run
```

No Docker or external database is required for this mode.

## Storage in Dev (Auto-Handled)

For local development, the default storage provider is `local_disk`, which persists uploaded images/attachments at:

- `~/.baton/instances/default/data/storage`

Configure storage provider/settings:

```sh
pnpm atototo configure --section storage
```

## Default Agent Workspaces

When a local agent run has no resolved project/session workspace, Baton falls back to an agent home workspace under the instance root:

- `~/.baton/instances/default/workspaces/<agent-id>`

This path honors `BATON_HOME` and `BATON_INSTANCE_ID` in non-default setups.

## Quick Health Checks

In another terminal:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Expected:

- `/api/health` returns `{"status":"ok"}`
- `/api/companies` returns a JSON array

## Reset Local Dev Database

To wipe local dev data and start fresh:

```sh
rm -rf ~/.baton/instances/default/db
pnpm dev
```

## Optional: Use External Postgres

If you set `DATABASE_URL`, the server will use that instead of embedded PostgreSQL.

## Automatic DB Backups

Baton can run automatic DB backups on a timer. Defaults:

- enabled
- every 60 minutes
- retain 30 days
- backup dir: `~/.baton/instances/default/data/backups`

Configure these in:

```sh
pnpm atototo configure --section database
```

Run a one-off backup manually:

```sh
pnpm atototo db:backup
# or:
pnpm db:backup
```

Environment overrides:

- `BATON_DB_BACKUP_ENABLED=true|false`
- `BATON_DB_BACKUP_INTERVAL_MINUTES=<minutes>`
- `BATON_DB_BACKUP_RETENTION_DAYS=<days>`
- `BATON_DB_BACKUP_DIR=/absolute/or/~/path`

## Secrets in Dev

Agent env vars now support secret references. By default, secret values are stored with local encryption and only secret refs are persisted in agent config.

- Default local key path: `~/.baton/instances/default/secrets/master.key`
- Override key material directly: `BATON_SECRETS_MASTER_KEY`
- Override key file path: `BATON_SECRETS_MASTER_KEY_FILE`

Strict mode (recommended outside local trusted machines):

```sh
BATON_SECRETS_STRICT_MODE=true
```

When strict mode is enabled, sensitive env keys (for example `*_API_KEY`, `*_TOKEN`, `*_SECRET`) must use secret references instead of inline plain values.

CLI configuration support:

- `pnpm atototo onboard` writes a default `secrets` config section (`local_encrypted`, strict mode off, key file path set) and creates a local key file when needed.
- `pnpm atototo configure --section secrets` lets you update provider/strict mode/key path and creates the local key file when needed.
- `pnpm atototo doctor` validates secrets adapter configuration and can create a missing local key file with `--repair`.

Migration helper for existing inline env secrets:

```sh
pnpm secrets:migrate-inline-env         # dry run
pnpm secrets:migrate-inline-env --apply # apply migration
```

## Company Deletion Toggle

Company deletion is intended as a dev/debug capability and can be disabled at runtime:

```sh
BATON_ENABLE_COMPANY_DELETION=false
```

Default behavior:

- `local_trusted`: enabled
- `authenticated`: disabled

## CLI Client Operations

Baton CLI now includes client-side control-plane commands in addition to setup commands.

Quick examples:

```sh
pnpm atototo issue list --company-id <company-id>
pnpm atototo issue create --company-id <company-id> --title "Investigate checkout conflict"
pnpm atototo issue update <issue-id> --status in_progress --comment "Started triage"
```

Set defaults once with context profiles:

```sh
pnpm atototo context set --api-base http://localhost:3100 --company-id <company-id>
```

Then run commands without repeating flags:

```sh
pnpm atototo issue list
pnpm atototo dashboard get
```

See full command reference in `doc/CLI.md`.

