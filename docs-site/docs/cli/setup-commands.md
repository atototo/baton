---
title: Setup Commands
description: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `baton run`

One-command bootstrap and start:

```sh
pnpm baton run
```

Does:

1. Auto-onboards if config is missing
2. Runs `baton doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm baton run --instance dev
```

## `baton onboard`

Interactive first-time setup:

```sh
pnpm baton onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm baton onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm baton onboard --yes
```

## `baton doctor`

Health checks with optional auto-repair:

```sh
pnpm baton doctor
pnpm baton doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `baton configure`

Update configuration sections:

```sh
pnpm baton configure --section server
pnpm baton configure --section secrets
pnpm baton configure --section storage
```

## `baton env`

Show resolved environment configuration:

```sh
pnpm baton env
```

## `baton allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm baton allowed-hostname my-tailscale-host
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
BATON_HOME=/custom/home BATON_INSTANCE_ID=dev pnpm baton run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm baton run --data-dir ./tmp/baton-dev
pnpm baton doctor --data-dir ./tmp/baton-dev
```
