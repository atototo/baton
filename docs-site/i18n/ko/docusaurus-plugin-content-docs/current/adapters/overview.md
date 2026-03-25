---
title: Adapter 개요
description: Adapter가 무엇이며 에이전트를 Baton에 어떻게 연결하는지 설명합니다
---

Adapter는 Baton의 오케스트레이션 계층과 에이전트 런타임 사이의 다리 역할을 합니다. 각 adapter는 특정 유형의 AI 에이전트를 호출하고 그 결과를 캡처하는 방법을 알고 있습니다.

## Adapter 작동 방식

heartbeat가 발생하면 Baton은 다음을 수행합니다:

1. 에이전트의 `adapterType`과 `adapterConfig`를 조회합니다
2. 실행 컨텍스트와 함께 adapter의 `execute()` 함수를 호출합니다
3. adapter가 에이전트 런타임을 생성하거나 호출합니다
4. adapter가 stdout을 캡처하고, 사용량/비용 데이터를 파싱하여 구조화된 결과를 반환합니다

## 내장 Adapter

### 로컬 코딩 Adapter

| Adapter | Type Key | 설명 |
|---------|----------|------|
| [Claude Local](/adapters/claude-local) | `claude_local` | Claude Code CLI를 로컬에서 실행합니다 |
| [Codex Local](/adapters/codex-local) | `codex_local` | OpenAI Codex CLI를 로컬에서 실행합니다 |
| [Cursor Local](/adapters/cursor-local) | `cursor` | Cursor CLI를 로컬에서 실행합니다 |
| [Gemini Local](/adapters/gemini-local) | `gemini_local` | Gemini CLI를 로컬에서 실행합니다 |
| [OpenCode Local](/adapters/opencode-local) | `opencode_local` | OpenCode를 로컬에서 실행합니다 |
| [Pi Local](/adapters/pi-local) | `pi_local` | Pi coding agent를 로컬에서 실행합니다 |

### 인프라 Adapter

| Adapter | Type Key | 설명 |
|---------|----------|------|
| [Process](/adapters/process) | `process` | 임의의 셸 명령을 실행합니다 |
| [HTTP](/adapters/http) | `http` | 외부 에이전트에 webhook을 전송합니다 |

## Adapter 아키텍처

각 adapter는 세 개의 모듈로 구성된 패키지입니다:

```
packages/adapters/<name>/
  src/
    index.ts            # Shared metadata (type, label, models)
    server/
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui/
      parse-stdout.ts   # Stdout -> transcript entries for run viewer
      build-config.ts   # Form values -> adapterConfig JSON
    cli/
      format-event.ts   # Terminal output for `baton run --watch`
```

세 개의 레지스트리가 이 모듈들을 사용합니다:

| 레지스트리 | 역할 |
|-----------|------|
| **Server** | 에이전트를 실행하고 결과를 캡처합니다 |
| **UI** | 실행 트랜스크립트를 렌더링하고 설정 폼을 제공합니다 |
| **CLI** | 실시간 모니터링을 위한 터미널 출력을 포맷합니다 |

## 공통 Adapter 유틸리티

여러 로컬 adapter는 `packages/adapter-utils`의 공통 헬퍼도 사용합니다:

- **Session compaction** — 실행 횟수, 토큰량, 세션 나이 기준을 넘으면 재개 세션을 회전하거나 초기화합니다
- **Log redaction** — 로그에서 민감한 홈 디렉터리 경로를 제거합니다
- **Billing inference** — provider별 사용량/비용 보고를 정규화합니다

## Prompt Composition

지원되는 로컬 adapter는 heartbeat 시 Baton이 조합한 보조 프로젝트 지시문을 받을 수 있습니다.

이 조합 레이어에는 다음이 들어갈 수 있습니다:

- project backstory
- compact context 또는 전체 conventions
- 중요한 governance reminders

## Adapter 선택 가이드

- **코딩 에이전트가 필요하신가요?** `claude_local`, `codex_local`, `cursor`, `gemini_local`, `opencode_local`, 또는 `pi_local`을 사용하십시오
- **스크립트나 명령을 실행해야 하나요?** `process`를 사용하십시오
- **외부 서비스를 호출해야 하나요?** `http`를 사용하십시오
- **커스텀 adapter가 필요하신가요?** [직접 adapter를 만들어 보십시오](/adapters/creating-an-adapter)
