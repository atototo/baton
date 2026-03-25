---
title: 아키텍처
description: 스택 개요, 요청 흐름, adapter 모델
---

import {
  StoryHero,
  ControlPlaneDiagram,
  CompareModes,
  GovernedFlowTimeline,
} from "@site/src/components/docs";

export const controlPlanePane = {
  title: "Baton control plane",
  summary: "회사 상태, 거버넌스 규칙, 감사 기록을 동기화합니다.",
  tone: "primary",
  bullets: [
    "회사 구조와 목표를 이해",
    "이슈, 승인, 예산, 활동을 추적",
    "어떤 작업이 진행될 수 있는지 결정",
    "runtime이 사용하는 API 제공",
  ],
};

export const executionAdapterPane = {
  title: "Execution adapter",
  summary: "Baton을 실제 에이전트가 실행되는 환경과 연결합니다.",
  tone: "success",
  bullets: [
    "Claude, Codex, Gemini, Pi 또는 다른 runtime 실행",
    "stdout, cost, session data 수집",
    "설정과 environment context 전달",
    "결과를 Baton으로 다시 보고",
  ],
};

<StoryHero
  eyebrow="시스템 관점"
  title="Baton은 control plane과 execution adapter로 이루어집니다."
  description="UI, API, 데이터베이스, adapter는 서로 다른 계층입니다. Baton은 회사 모델을 조정하고, adapter는 실제 작업이 실행되는 runtime과 Baton을 연결합니다."
  bullets={[
    "Control plane은 허용된 행동을 결정하고, 무슨 일이 일어났는지 기록하며, 회사 모델을 동기화합니다.",
    "Adapters는 Baton을 Claude, Codex, Gemini, Pi, shell process, HTTP runtime과 연결합니다.",
    "runtime이 바뀌어도 제품 구조는 일관되게 유지됩니다.",
  ]}
  stats={[
    { value: "Control plane 우선", label: "Baton이 회사 상태, 거버넌스, 감사 기록을 소유합니다." },
    { value: "여러 runtime", label: "같은 제품이 여러 에이전트 runtime을 조정할 수 있습니다." },
    { value: "하나의 계약", label: "UI, API, adapter의 행동은 서로 맞물려 있습니다." },
  ]}
/>

## 스택 개요

<ControlPlaneDiagram
  center={{
    title: "Baton",
    description: "회사 모델과 실행을 연결하는 control plane입니다.",
    tone: "primary",
  }}
  top={[
    {
      title: "React UI",
      description: "운영자가 보는 대시보드입니다. 회사, 에이전트, 작업, 승인, 로그를 다룹니다.",
      tone: "primary",
    },
  ]}
  left={[
    {
      title: "Express API",
      description: "인증, 비즈니스 로직, adapter 호출을 조정하는 REST 표면입니다.",
      tone: "success",
    },
  ]}
  right={[
    {
      title: "Adapters",
      description: "Claude Code, Codex, Gemini, Pi, process, HTTP runtime과의 built-in 통합입니다.",
      tone: "warning",
    },
  ]}
  bottom={[
    {
      title: "PostgreSQL",
      description: "회사, 에이전트, 이슈, 승인, 활동의 영속적 원본입니다.",
      tone: "neutral",
    },
    {
      title: "Docs와 skills",
      description: "회사가 어떻게 행동해야 하는지 설명하는 참고 자료와 에이전트 instructions입니다.",
      tone: "neutral",
    },
    {
      title: "Audit와 budgets",
      description: "자율 실행을 관측 가능하고 안전하게 만드는 안전장치입니다.",
      tone: "danger",
    },
  ]}
/>

## 기술 스택

| 계층 | 기술 |
|-------|-----------|
| 프론트엔드 | React 19, Vite 6, React Router 7, Radix UI, Tailwind CSS 4, TanStack Query |
| 백엔드 | Node.js 20+, Express.js 5, TypeScript |
| 데이터베이스 | PostgreSQL 17 또는 내장 PGlite, Drizzle ORM |
| 인증 | Better Auth, sessions, agent API keys |
| Adapter | Claude Code CLI, Codex CLI, Gemini CLI, Pi local runtime, shell process, HTTP webhook |
| 패키지 매니저 | pnpm 9 with workspaces |

## 레포지토리 구조

```
baton/
├── ui/                          # React 프론트엔드
│   ├── src/pages/               # 라우트 페이지
│   ├── src/components/          # React 컴포넌트
│   ├── src/api/                 # API 클라이언트
│   └── src/context/             # React context 프로바이더
│
├── server/                      # Express API
│   ├── src/routes/              # REST 엔드포인트
│   ├── src/services/            # 비즈니스 로직
│   ├── src/adapters/            # 에이전트 실행 adapter
│   └── src/middleware/          # 인증, 로깅
│
├── packages/
│   ├── db/                      # Drizzle 스키마 + 마이그레이션
│   ├── shared/                  # API 타입, 상수, 검증기
│   ├── adapter-utils/           # Adapter 인터페이스 및 헬퍼
│   └── adapters/
│       ├── claude-local/        # Claude Code adapter
│       ├── codex-local/         # OpenAI Codex adapter
│       ├── gemini-local/        # Gemini CLI adapter
│       └── pi-local/            # Pi local adapter
│
├── skills/
│   └── baton/                   # Core Baton skill and heartbeat protocol
│
├── cli/                         # CLI 클라이언트
│   └── src/                     # 설정 및 control plane 명령어
│
└── doc/                         # 내부 문서
```

## 요청 흐름

Heartbeat 실행은 stack을 따라 예측 가능한 순서로 이동합니다.

<GovernedFlowTimeline
  stages={[
    { title: "트리거", description: "스케줄, 수동 invoke, 멘션, 할당이 heartbeat를 시작합니다.", state: "warning" },
    { title: "Adapter 호출", description: "서버가 선택된 adapter의 execute 함수를 호출합니다.", state: "active" },
    { title: "Agent process", description: "Adapter가 Baton 환경 변수와 prompt context를 포함해 runtime을 실행합니다.", state: "pending" },
    { title: "작업", description: "에이전트가 REST API를 호출해 할당을 확인하고, 태스크를 checkout하고, 상태를 갱신합니다.", state: "pending" },
    { title: "기록", description: "서버가 결과, 비용, 다음 실행을 위한 session state를 저장합니다.", state: "done" },
  ]}
/>

## Adapter 모델

<CompareModes
  left={controlPlanePane}
  right={executionAdapterPane}
/>

기본 제공 adapter에는 `claude_local`, `codex_local`, `gemini_local`, `pi_local`, `process`, `http`가 포함됩니다.

## 핵심 설계 결정

- **Control plane이지 실행 플레인이 아닙니다** - Baton은 에이전트를 조정하지만 runtime을 대체하지는 않습니다
- **회사 범위** - 모든 엔티티는 정확히 하나의 회사에 속합니다
- **단일 담당자 태스크** - 원자적 체크아웃으로 동일 태스크의 동시 작업을 막습니다
- **Adapter 비종속적** - HTTP API를 호출할 수 있는 모든 runtime이 참여할 수 있습니다
- **기본 내장 모드** - 별도 데이터베이스 없이 로컬 개발이 가능합니다
