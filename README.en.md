# Baton ✨

[🇰🇷 한국어](./README.md) | [🇺🇸 English](./README.en.md)

> Forked from [paperclipai/paperclip](https://github.com/paperclipai/paperclip) and customized for personal AI-agent orchestration workflows.

## 🎬 Keypoint Demo (Top README Clip)

<video src="./docs/media/baton-readme-keypoints.mp4" controls muted playsinline width="980"></video>

> Flow: Company selector/add menu → Dashboard → Issue Kanban board → Issue detail → Agent screen

## What is Baton?

Baton is an orchestration platform for running multiple AI agents (Claude Code, Codex, Gemini, etc.) like an organized team.

**Core values:**
- 🎯 **Agent-agnostic architecture** — if it has a CLI, you can hire it
- 💓 **Heartbeat polling** — continuous task handoff without pipeline deadlocks
- ⚛️ **Atomic task checkout** — prevents duplicate execution
- 🏗️ **Mission → Project → Task hierarchy** — every action tied to higher-level goals
- 💰 **Budget & cost control** — per-agent monthly budget enforcement
- 🛡️ **Governance + rollback** — approval gates, config history, rollback support

## Current Customizations

- 🎨 UI/theme revamp with Baton branding
- 🌐 i18n improvements and missing string coverage
- 🧩 Dashboard / Issues / Agent screen UX updates
- 📌 README keypoint demo clip

## Baton vs Original Paperclip

| Item | Paperclip | Baton |
|------|-----------|-------|
| Branding | Paperclip (clip icon) | Baton (wand-sparkles icon) |
| CLI command | `paperclip` | `baton` |
| Package org | `@paperclip/*` | `@atototo/*` |
| Primary goal | General AI company ops | Personal dev workflow optimization |
| MCP integration | None | Planned (Claude Code Remote) |

## Quickstart

```bash
git clone https://github.com/atototo/baton.git
cd baton
pnpm install
pnpm dev
```

Dashboard: `http://localhost:3100`

Onboard:
```bash
pnpm baton onboard
```

> **Requirements:** Node.js 20+, pnpm 9.15+

## Development

```bash
pnpm dev              # Full dev (API + UI)
pnpm dev:server       # Server only
pnpm build            # Build all
pnpm typecheck        # Type checking
pnpm test:run         # Run tests
pnpm db:generate      # Generate DB migration
pnpm db:migrate       # Apply migrations
```

## Roadmap

- [ ] Claude Code Remote MCP integration
- [ ] Codex/Gemini integration tests
- [ ] Adopt ai-party plugin patterns (phase gates, ticket system)
- [ ] Custom agent adapters
- [ ] README/doc + demo video enhancement (KR/EN split)

## Attribution

- This project is based on the original work: [paperclipai/paperclip](https://github.com/paperclipai/paperclip)
- Baton includes custom branding, workflow changes, UI updates, and localization improvements on top of upstream.

## License

MIT — Original work &copy; 2026 [Paperclip AI](https://github.com/paperclipai/paperclip)
