# CLI Reference

Baton CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm atototo --help
```

First-time local bootstrap + run:

```sh
pnpm atototo run
```

Choose local instance:

```sh
pnpm atototo run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `atototo onboard` and `atototo configure --section server` set deployment mode in config
- runtime can override mode with `BATON_DEPLOYMENT_MODE`
- `atototo run` and `atototo doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm atototo allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.baton`:

```sh
pnpm atototo run --data-dir ./tmp/baton-dev
pnpm atototo issue list --data-dir ./tmp/baton-dev
```

## Context Profiles

Store local defaults in `~/.baton/context.json`:

```sh
pnpm atototo context set --api-base http://localhost:3100 --company-id <company-id>
pnpm atototo context show
pnpm atototo context list
pnpm atototo context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm atototo context set --api-key-env-var-name BATON_API_KEY
export BATON_API_KEY=...
```

## Company Commands

```sh
pnpm atototo company list
pnpm atototo company get <company-id>
pnpm atototo company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm atototo company delete PAP --yes --confirm PAP
pnpm atototo company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `BATON_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `BATON_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm atototo issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm atototo issue get <issue-id-or-identifier>
pnpm atototo issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm atototo issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm atototo issue comment <issue-id> --body "..." [--reopen]
pnpm atototo issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm atototo issue release <issue-id>
```

## Agent Commands

```sh
pnpm atototo agent list --company-id <company-id>
pnpm atototo agent get <agent-id>
```

## Approval Commands

```sh
pnpm atototo approval list --company-id <company-id> [--status pending]
pnpm atototo approval get <approval-id>
pnpm atototo approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm atototo approval approve <approval-id> [--decision-note "..."]
pnpm atototo approval reject <approval-id> [--decision-note "..."]
pnpm atototo approval request-revision <approval-id> [--decision-note "..."]
pnpm atototo approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm atototo approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm atototo activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm atototo dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm atototo heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.baton/instances/default`:

- config: `~/.baton/instances/default/config.json`
- embedded db: `~/.baton/instances/default/db`
- logs: `~/.baton/instances/default/logs`
- storage: `~/.baton/instances/default/data/storage`
- secrets key: `~/.baton/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
BATON_HOME=/custom/home BATON_INSTANCE_ID=dev pnpm atototo run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm atototo configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
