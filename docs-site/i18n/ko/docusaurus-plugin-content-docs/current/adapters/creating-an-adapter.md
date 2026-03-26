---
title: 어댑터 만들기
description: 커스텀 어댑터 구축 가이드
---

커스텀 어댑터를 만들어 Baton을 원하는 에이전트 런타임에 연결할 수 있습니다.

:::tip
Claude Code를 사용하고 계신다면, `create-agent-adapter` 스킬이 전체 어댑터 생성 과정을 대화형으로 안내해 드립니다. Claude에게 새 어댑터를 만들어 달라고 요청하시면 각 단계를 안내받으실 수 있습니다.
:::

## 패키지 구조

```
packages/adapters/<name>/
  package.json
  tsconfig.json
  src/
    index.ts            # Shared metadata
    server/
      index.ts          # Server exports
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui/
      index.ts          # UI exports
      parse-stdout.ts   # Transcript parser
      build-config.ts   # Config builder
    cli/
      index.ts          # CLI exports
      format-event.ts   # Terminal formatter
```

## Step 1: 루트 메타데이터

`src/index.ts`는 세 개의 소비자 모두에서 가져옵니다. 의존성 없이 유지하십시오.

```ts
export const type = "my_agent";        // snake_case, globally unique
export const label = "My Agent (local)";
export const models = [
  { id: "model-a", label: "Model A" },
];
export const agentConfigurationDoc = `# my_agent configuration
Use when: ...
Don't use when: ...
Core fields: ...
`;
```

## Step 2: Server Execute

`src/server/execute.ts`가 핵심입니다. `AdapterExecutionContext`를 받아 `AdapterExecutionResult`를 반환합니다.

주요 책임:

1. 안전한 헬퍼(`asString`, `asNumber` 등)를 사용하여 설정을 읽습니다
2. `buildBatonEnv(agent)`와 컨텍스트 변수로 환경을 구성합니다
3. `runtime.sessionParams`에서 세션 상태를 해석합니다
4. `renderTemplate(template, data)`로 프롬프트를 렌더링합니다
5. `runChildProcess()`로 프로세스를 생성하거나 `fetch()`로 호출합니다
6. 사용량, 비용, 세션 상태, 오류에 대해 출력을 파싱합니다
7. 알 수 없는 세션 오류를 처리합니다 (새 세션으로 재시도, `clearSession: true` 설정)

## Step 3: 환경 테스트

`src/server/test.ts`는 실행 전에 어댑터 설정을 검증합니다.

구조화된 진단 결과를 반환합니다:

- `error` — 유효하지 않거나 사용할 수 없는 설정
- `warn` — 차단되지 않는 이슈
- `info` — 성공적인 검사

## Step 4: UI 모듈

- `parse-stdout.ts` — stdout 라인을 실행 뷰어용 `TranscriptEntry[]`로 변환합니다
- `build-config.ts` — 폼 값을 `adapterConfig` JSON으로 변환합니다
- 설정 필드 React 컴포넌트: `ui/src/adapters/<name>/config-fields.tsx`

## Step 5: CLI 모듈

`format-event.ts` — `picocolors`를 사용하여 `baton run --watch`용 stdout를 포맷합니다.

## Step 6: 등록

세 개의 레지스트리 모두에 어댑터를 추가합니다:

1. `server/src/adapters/registry.ts`
2. `ui/src/adapters/registry.ts`
3. `cli/src/adapters/registry.ts`

## 스킬 주입

에이전트의 작업 디렉터리에 쓰지 않고 에이전트 런타임에서 Baton 스킬을 검색할 수 있도록 합니다:

1. **최선: tmpdir + flag** — tmpdir을 생성하고, 스킬을 심볼릭 링크한 후, CLI 플래그로 전달하고, 완료 후 정리합니다
2. **허용: 글로벌 설정 디렉터리** — 런타임의 글로벌 플러그인 디렉터리에 심볼릭 링크합니다
3. **허용: 환경 변수** — 스킬 경로 환경 변수를 리포지토리의 `skills/` 디렉터리로 지정합니다
4. **최후 수단: 프롬프트 주입** — 프롬프트 템플릿에 스킬 내용을 포함합니다

## 보안

- 에이전트 출력을 신뢰하지 않는 것으로 취급합니다 (방어적으로 파싱하고, 절대 실행하지 않습니다)
- 시크릿은 프롬프트가 아닌 환경 변수를 통해 주입합니다
- 런타임이 지원하는 경우 네트워크 접근 제어를 설정합니다
- 항상 타임아웃과 유예 기간을 적용합니다
