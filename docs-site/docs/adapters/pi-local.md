---
title: Pi Local
description: Pi local adapter setup and configuration
---

The `pi_local` adapter runs the Pi coding agent locally. It supports provider/model routing, session resume, bundle-based instructions, and Baton-managed project-context injection.

## Prerequisites

- Pi CLI installed (`pi` command available)
- a configured Pi provider/model environment

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permitted) |
| `model` | string | Yes | Pi model ID in `provider/model` format |
| `instructionsFilePath` | string | No | Absolute path to the bundle entry file appended to Pi's system prompt |
| `promptTemplate` | string | No | User prompt template passed to Pi |
| `thinking` | string | No | Thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) |
| `command` | string | No | CLI executable name (defaults to `pi`) |
| `env` | object | No | Environment variables (supports secret refs) |
| `timeoutSec` | number | No | Run timeout in seconds |
| `graceSec` | number | No | Grace period before force-kill |

## Session Persistence

Pi local stores Baton-managed sessions and resumes them with `--session` across heartbeats.

## Tooling Model

Pi exposes its own local tool set for file and shell operations. Baton orchestrates the run and captures logs, status, and usage.

## Instructions And Project Context

Pi local receives:

- the bundle entry file through `instructionsFilePath`
- composed project instructions generated from project conventions and governance reminders

This keeps reusable role behavior separate from project-specific context.

## Environment Test

Use the UI environment test to verify:

- Pi CLI is installed
- the configured model is valid
- the working directory is available
- the CLI can complete a simple probe successfully
