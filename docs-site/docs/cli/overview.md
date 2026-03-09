---
title: CLI Overview
description: CLI installation and setup
---

The Baton CLI handles instance setup, diagnostics, and control-plane operations.

## Usage

```sh
pnpm baton --help
```

## Global Options

All commands support:

| Flag | Description |
|------|-------------|
| `--data-dir <path>` | Local Baton data root (isolates from `~/.baton`) |
| `--api-base <url>` | API base URL |
| `--api-key <token>` | API authentication token |
| `--context <path>` | Context file path |
| `--profile <name>` | Context profile name |
| `--json` | Output as JSON |

Company-scoped commands also accept `--company-id <id>`.

For clean local instances, pass `--data-dir` on the command you run:

```sh
pnpm baton run --data-dir ./tmp/baton-dev
```

## Context Profiles

Store defaults to avoid repeating flags:

```sh
# Set defaults
pnpm baton context set --api-base http://localhost:3100 --company-id <id>

# View current context
pnpm baton context show

# List profiles
pnpm baton context list

# Switch profile
pnpm baton context use default
```

To avoid storing secrets in context, use an env var:

```sh
pnpm baton context set --api-key-env-var-name BATON_API_KEY
export BATON_API_KEY=...
```

Context is stored at `~/.baton/context.json`.

## Command Categories

The CLI has two categories:

1. **[Setup commands](/cli/setup-commands)** — instance bootstrap, diagnostics, configuration
2. **[Control-plane commands](/cli/control-plane-commands)** — issues, agents, approvals, activity
