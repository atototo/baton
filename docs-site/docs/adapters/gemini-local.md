---
title: Gemini Local
description: Gemini CLI local adapter setup and configuration
---

The `gemini_local` adapter runs the Gemini CLI locally. It supports resumable sessions, Baton skills injection, instructions bundle integration, and supplementary project-context injection.

## Prerequisites

- Gemini CLI installed (`gemini` command available)
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or a working Gemini CLI local login

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permitted) |
| `model` | string | No | Gemini model ID (defaults to `auto`) |
| `instructionsFilePath` | string | No | Absolute path to the bundle entry file Baton prepends to the run prompt |
| `promptTemplate` | string | No | Prompt template for the user task |
| `sandbox` | boolean | No | Sandbox mode toggle |
| `command` | string | No | CLI executable name (defaults to `gemini`) |
| `extraArgs` | string[] | No | Additional CLI flags |
| `env` | object | No | Environment variables (supports secret refs) |
| `timeoutSec` | number | No | Run timeout in seconds |
| `graceSec` | number | No | Grace period before force-kill |

## Session Persistence

Gemini local resumes sessions across heartbeats when the saved session still matches the current working directory.

## Skills Injection

Baton injects skills into the Gemini skills directory so the CLI can discover Baton-specific skills without modifying your project checkout.

## Instructions And Project Context

Gemini local can receive both:

- the agent's instructions bundle entry file
- composed project instructions generated from backstory, conventions, compact context, and governance reminders

## Environment Test

Use the UI environment test to verify:

- Gemini CLI is installed
- the working directory is valid
- authentication is available
- the CLI can execute a simple live probe successfully
