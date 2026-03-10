# Baton ✨

[🇰🇷 한국어](./README.md) | [🇺🇸 English](./README.en.md)

> Forked from [paperclipai/paperclip](https://github.com/paperclipai/paperclip) — AI 에이전트 오케스트레이션 플랫폼을 개인 워크플로우에 맞게 개편 중

## 🎬 Keypoint Demo (README 상단용)

<video src="./docs/media/baton-readme-keypoints.mp4" controls muted playsinline width="980"></video>

> 흐름: 회사 선택/추가 메뉴 → 대시보드 → 이슈 칸반보드 → 이슈 상세 → 에이전트 화면

## What is Baton?

여러 AI 에이전트(Claude Code, Codex, Gemini 등)를 하나의 조직처럼 운영하는 오케스트레이션 플랫폼.

**핵심 가치:**
- 🎯 **에이전트 불가지론** — Claude, Codex, Gemini 등 CLI가 있으면 뭐든 "고용" 가능
- 💓 **Heartbeat 폴링** — 파이프라인 교착 없는 태스크 분배
- ⚛️ **원자적 태스크 체크아웃** — 중복 실행 방지
- 🏗️ **미션→프로젝트→태스크 계층** — 모든 작업이 상위 목표와 연결
- 💰 **비용/예산 제어** — 에이전트별 월 예산 강제
- 🛡️ **거버넌스 + 롤백** — 승인 게이트, 설정 변경 이력, 롤백

## 현재 반영된 커스텀 포인트

- 🎨 UI/테마 개편 (Baton 브랜딩 중심)
- 🌐 다국어(i18n) 적용 및 누락 문자열 보완
- 🧩 이슈/대시보드/에이전트 화면 구성 개선
- 📌 README용 키포인트 데모 영상 추가

## Original Paperclip과 차이점

| 항목 | Paperclip | Baton |
|------|-----------|-------|
| 브랜딩 | Paperclip (클립 아이콘) | Baton (wand-sparkles 아이콘) |
| CLI 명령어 | `paperclip` | `baton` |
| 패키지 org | `@paperclip/*` | `@atototo/*` |
| 목적 | 범용 AI 회사 운영 | 개인 개발 워크플로우 최적화 |
| MCP 연동 | 없음 | 예정 (Claude Code Remote 연동) |

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

- [ ] Claude Code Remote MCP 연동
- [ ] Codex/Gemini 에이전트 통합 테스트
- [ ] ai-party 플러그인 패턴 흡수 (phase gate, 티켓 시스템)
- [ ] 커스텀 에이전트 어댑터
- [ ] README 문서/데모 영상 고도화 (영문/국문 분리)

## Attribution

- This project is based on the original work: [paperclipai/paperclip](https://github.com/paperclipai/paperclip)
- Baton includes custom branding, workflow, UI changes, and localization improvements on top of the upstream project.

## License

MIT — Original work &copy; 2026 [Paperclip AI](https://github.com/paperclipai/paperclip)
