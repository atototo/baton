---
title: 아키텍처
description: 스택 개요, 요청 흐름, adapter 모델
---

Baton은 네 가지 주요 계층으로 구성된 모노레포입니다.

## 스택 개요

```
┌─────────────────────────────────────┐
│  React UI (Vite)                    │
│  Dashboard, org management, tasks   │
├─────────────────────────────────────┤
│  Express.js REST API (Node.js)      │
│  Routes, services, auth, adapters   │
├─────────────────────────────────────┤
│  PostgreSQL (Drizzle ORM)           │
│  Schema, migrations, embedded mode  │
├─────────────────────────────────────┤
│  Adapters                           │
│  Claude Local, Codex Local,         │
│  Process, HTTP                      │
└─────────────────────────────────────┘
```

## 기술 스택

| 계층 | 기술 |
|-------|-----------|
| 프론트엔드 | React 19, Vite 6, React Router 7, Radix UI, Tailwind CSS 4, TanStack Query |
| 백엔드 | Node.js 20+, Express.js 5, TypeScript |
| 데이터베이스 | PostgreSQL 17 (또는 내장 PGlite), Drizzle ORM |
| 인증 | Better Auth (세션 + API 키) |
| Adapter | Claude Code CLI, Codex CLI, 셸 프로세스, HTTP 웹훅 |
| 패키지 매니저 | pnpm 9 with workspaces |

## 레포지토리 구조

```
baton/
├── ui/                          # React 프론트엔드
│   ├── src/pages/              # 라우트 페이지
│   ├── src/components/         # React 컴포넌트
│   ├── src/api/                # API 클라이언트
│   └── src/context/            # React context 프로바이더
│
├── server/                      # Express.js API
│   ├── src/routes/             # REST 엔드포인트
│   ├── src/services/           # 비즈니스 로직
│   ├── src/adapters/           # 에이전트 실행 adapter
│   └── src/middleware/         # 인증, 로깅
│
├── packages/
│   ├── db/                      # Drizzle 스키마 + 마이그레이션
│   ├── shared/                  # API 타입, 상수, 검증기
│   ├── adapter-utils/           # Adapter 인터페이스 및 헬퍼
│   └── adapters/
│       ├── claude-local/        # Claude Code adapter
│       └── codex-local/         # OpenAI Codex adapter
│
├── skills/                      # 에이전트 스킬
│   └── baton/               # 코어 Baton 스킬 (heartbeat 프로토콜)
│
├── cli/                         # CLI 클라이언트
│   └── src/                     # 설정 및 Control Plane 명령어
│
└── doc/                         # 내부 문서
```

## 요청 흐름

Heartbeat가 실행되면:

1. **트리거** — 스케줄러, 수동 호출 또는 이벤트(할당, 멘션)가 heartbeat를 트리거합니다
2. **Adapter 호출** — 서버가 설정된 adapter의 `execute()` 함수를 호출합니다
3. **에이전트 프로세스** — Adapter가 Baton 환경 변수와 프롬프트를 포함하여 에이전트(예: Claude Code CLI)를 생성합니다
4. **에이전트 작업** — 에이전트가 Baton의 REST API를 호출하여 할당된 작업을 확인하고, 태스크를 체크아웃하고, 작업을 수행하고, 상태를 업데이트합니다
5. **결과 캡처** — Adapter가 stdout를 캡처하고, 사용량/비용 데이터를 파싱하고, 세션 상태를 추출합니다
6. **실행 기록** — 서버가 실행 결과, 비용, 다음 heartbeat를 위한 세션 상태를 기록합니다

## Adapter 모델

Adapter는 Baton과 에이전트 런타임 사이의 브릿지입니다. 각 adapter는 세 가지 모듈로 구성된 패키지입니다:

- **서버 모듈** — 에이전트를 생성/호출하는 `execute()` 함수 및 환경 진단
- **UI 모듈** — 실행 뷰어를 위한 stdout 파서, 에이전트 생성을 위한 설정 폼 필드
- **CLI 모듈** — `baton run --watch`를 위한 터미널 포맷터

기본 제공 adapter: `claude_local`, `codex_local`, `process`, `http`. 모든 런타임에 대해 커스텀 adapter를 생성할 수 있습니다.

## 핵심 설계 결정

- **Control Plane이지 실행 플레인이 아닙니다** — Baton은 에이전트를 오케스트레이션하며, 직접 실행하지 않습니다
- **회사 범위** — 모든 엔티티는 정확히 하나의 회사에 속하며, 엄격한 데이터 경계가 적용됩니다
- **단일 담당자 태스크** — 원자적 체크아웃으로 동일한 태스크에 대한 동시 작업을 방지합니다
- **Adapter 비종속적** — HTTP API를 호출할 수 있는 모든 런타임이 에이전트로 작동합니다
- **기본 내장 모드** — 내장 PostgreSQL을 사용한 설정 없는 로컬 모드
