---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `atototo run`

One-command bootstrap and start:

```sh
pnpm atototo run
```

Does:

1. Auto-onboards if config is missing
2. Runs `atototo doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm atototo run --instance dev
```

## `atototo onboard`

Interactive first-time setup:

```sh
pnpm atototo onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm atototo onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm atototo onboard --yes
```

## `atototo doctor`

Health checks with optional auto-repair:

```sh
pnpm atototo doctor
pnpm atototo doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `atototo configure`

Update configuration sections:

```sh
pnpm atototo configure --section server
pnpm atototo configure --section secrets
pnpm atototo configure --section storage
```

## `atototo env`

Show resolved environment configuration:

```sh
pnpm atototo env
```

## `atototo allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm atototo allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.baton/instances/default/config.json` |
| Database | `~/.baton/instances/default/db` |
| Logs | `~/.baton/instances/default/logs` |
| Storage | `~/.baton/instances/default/data/storage` |
| Secrets key | `~/.baton/instances/default/secrets/master.key` |

Override with:

```sh
BATON_HOME=/custom/home BATON_INSTANCE_ID=dev pnpm atototo run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm atototo run --data-dir ./tmp/baton-dev
pnpm atototo doctor --data-dir ./tmp/baton-dev
```
