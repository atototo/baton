---
title: Cursor Local
description: Cursor CLI local adapter setup and configuration
---

The `cursor` adapter runs Cursor Agent CLI locally. It supports resumable sessions, skills injection, and structured stream output.

## Prerequisites

- Cursor CLI installed (`agent` command available)
- A working Cursor account/session if the CLI requires it in your environment

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permissions allow) |
| `model` | string | No | Cursor model id (defaults to `auto`) |
| `mode` | string | No | Cursor execution mode passed as `--mode` (`plan` or `ask`) |
| `instructionsFilePath` | string | No | Absolute path to the bundle entry file Baton prepends to the run prompt |
| `promptTemplate` | string | No | Prompt used for all runs |
| `command` | string | No | CLI executable name (defaults to `agent`) |
| `extraArgs` | string[] | No | Additional CLI args |
| `env` | object | No | Environment variables |
| `timeoutSec` | number | No | Process timeout |
| `graceSec` | number | No | Grace period before force-kill |

## Session Persistence

Cursor resumes sessions with `--resume` when the stored session cwd matches the current cwd.

## Skills Injection

Baton auto-injects local skills into `~/.cursor/skills` when they are missing so Cursor can discover Baton skills on local runs.

## Instructions And Project Context

Cursor local receives:

- the agent bundle entry file from `instructionsFilePath`
- any composed project instructions Baton generates from project conventions and governance reminders

This keeps reusable role behavior separate from project-specific context while still presenting one effective runtime prompt.

## Execution Notes

Baton runs Cursor with structured stream output and pipes prompts through stdin. Baton also auto-adds `--yolo` unless one of `--trust`, `--yolo`, or `-f` is already present in `extraArgs`.

## Environment Test

The environment test checks:

- Cursor CLI is installed and accessible
- the working directory is absolute and available (auto-created if missing and permitted)
- authentication or login state is available if Cursor requires it
- a live hello probe (`agent -p --output-format stream-json --verbose` with prompt `Respond with hello.`) to verify the CLI can run
