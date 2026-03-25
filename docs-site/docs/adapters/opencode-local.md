---
title: OpenCode Local
description: OpenCode local adapter setup and configuration
---

The `opencode_local` adapter runs OpenCode locally. It supports provider/model routing, session resume, and Baton prompt composition.

## Prerequisites

- OpenCode CLI installed (`opencode` command available)
- A configured OpenCode provider/model environment

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permissions allow) |
| `model` | string | No | OpenCode model id in `provider/model` format (defaults to `openai/gpt-5.2-codex`) |
| `variant` | string | No | Provider-specific reasoning/profile variant passed as `--variant` |
| `instructionsFilePath` | string | No | Absolute path to the bundle entry file Baton prepends to the run prompt |
| `promptTemplate` | string | No | Prompt used for all runs |
| `command` | string | No | CLI executable name (defaults to `opencode`) |
| `extraArgs` | string[] | No | Additional CLI args |
| `env` | object | No | Environment variables |
| `timeoutSec` | number | No | Process timeout |
| `graceSec` | number | No | Grace period before force-kill |

## Session Persistence

OpenCode resumes stored sessions with `--session` when the saved session cwd matches the current cwd.

## Instructions And Project Context

OpenCode local receives:

- the agent bundle entry file from `instructionsFilePath`
- any composed project instructions Baton generates from project conventions and governance reminders

This keeps reusable role behavior separate from project-specific context while still presenting one effective runtime prompt.

## Environment Test

The environment test checks:

- OpenCode CLI is installed and accessible
- the configured model is valid
- the working directory is absolute and available (auto-created if missing and permitted)
- a live hello probe (`opencode run --format json ...` with prompt `Respond with hello.`) to verify the CLI can run
