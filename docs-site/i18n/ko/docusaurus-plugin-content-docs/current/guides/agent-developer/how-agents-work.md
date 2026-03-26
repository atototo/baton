---
title: 에이전트 작동 방식
description: 에이전트 생명주기, 실행 모델 및 상태
---

import {
  CalloutGrid,
  CompareModes,
  GovernedFlowTimeline,
  ScreenTour,
  StateLifecycle,
  StoryHero,
} from "@site/src/components/docs";

export const daemonPane = {
  title: "항상 켜져 있는 작업자",
  summary: "계속 살아 있으면서 모든 상태를 한 프로세스에 쌓아 두는 방식입니다.",
  tone: "neutral",
  bullets: [
    "작업이 언제 시작되고 끝났는지 읽기 어렵습니다",
    "프로세스가 계속 살아 있으면 상태가 흐려질 수 있습니다",
    "감사 로그와 비용 캡처를 따로 붙여야 하는 경우가 많습니다",
  ],
};

export const heartbeatPane = {
  title: "Baton 하트비트",
  summary: "짧게 깨어나서 일하고, 기록을 남기고, 다시 멈추는 방식입니다.",
  tone: "primary",
  bullets: [
    "매 실행에 경계가 있어서 감사하기 쉽습니다",
    "세션 상태를 다음 기상 때 복원할 수 있습니다",
    "비용과 출력이 각 heartbeat 뒤에 캡처됩니다",
  ],
};

<StoryHero
  eyebrow="에이전트 개발자"
  title="에이전트는 깨어나서 짧게 일하고 다시 잠듭니다."
  description="Baton의 에이전트는 계속 돌아가는 데몬이 아닙니다. 짧은 heartbeat 동안 깨어나 adapter에 연결하고, 무엇을 해야 하는지 확인한 뒤, 결과를 Baton에 돌려주는 AI 직원입니다."
  bullets={[
    "하트비트 모델은 실행을 이해하기 쉽게 만듭니다.",
    "어댑터는 Baton과 실제 런타임을 이어 주는 다리입니다.",
    "상태, 비용, 세션 정보는 매 실행 뒤 기록됩니다.",
  ]}
  stats={[
    { value: "Heartbeat", label: "에이전트가 실제로 일하는 짧은 실행 창입니다." },
    { value: "Adapter", label: "Claude, Codex, Gemini, Pi 등 런타임으로 연결하는 다리입니다." },
    { value: "Run record", label: "비용, 출력, 상태를 남기는 감사 기록입니다." },
  ]}
/>

## 실행 모델

<CompareModes left={daemonPane} right={heartbeatPane} />

<GovernedFlowTimeline
  stages={[
    {
      title: "트리거",
      description: "스케줄, 할당, 멘션, 수동 호출, 승인 완료 같은 이벤트가 에이전트를 깨웁니다.",
      meta: "이 이벤트가 heartbeat를 시작합니다.",
      state: "active",
    },
    {
      title: "Adapter 호출",
      description: "Baton이 설정된 adapter를 호출하고 회사 맥락을 넘깁니다.",
      meta: "runtime 시작은 adapter가 맡습니다.",
      state: "pending",
    },
    {
      title: "에이전트 런타임",
      description: "adapter가 Claude Code CLI 같은 실제 런타임을 시작합니다.",
      meta: "이곳에서 에이전트가 생각하고 행동합니다.",
      state: "pending",
    },
    {
      title: "Baton API 호출",
      description: "에이전트는 할당을 확인하고, 작업을 선점하고, 진행 상황을 업데이트합니다.",
      meta: "Baton이 계속 단일 진실의 원천입니다.",
      state: "pending",
    },
    {
      title: "결과 캡처와 기록",
      description: "adapter가 출력, 사용량, 비용, 세션 상태를 캡처하고 Baton이 실행 결과를 저장합니다.",
      meta: "모든 실행은 감사 가능해야 합니다.",
      state: "pending",
    },
  ]}
/>

## Baton이 주입하는 값

<CalloutGrid
  cards={[
    {
      eyebrow: "신원",
      title: "에이전트와 회사 ID",
      description: "각 실행은 어느 에이전트와 회사에 속하는지 알고 시작합니다.",
      tone: "primary",
    },
    {
      eyebrow: "트리거",
      title: "왜 깨어났는지",
      description: "트리거 이유를 넘겨서 에이전트가 어떤 일을 우선해야 하는지 알 수 있게 합니다.",
      tone: "success",
    },
    {
      eyebrow: "세션",
      title: "실행 사이에 유지되는 상태",
      description: "adapter가 세션 컨텍스트를 복원해 다음 heartbeat에서 이어서 일할 수 있게 합니다.",
      tone: "warning",
    },
    {
      eyebrow: "상태",
      title: "마지막 실행 맥락",
      description: "승인과 연결된 heartbeat라면 그 컨텍스트도 함께 볼 수 있습니다.",
      tone: "neutral",
    },
  ]}
/>

## 런타임 값

이 값이 모든 하트비트에 항상 들어오는 것은 아닙니다. 첫 번째 표의 값은 항상 존재하고, 두 번째 표의 값은 특정 이슈, 댓글, 승인 맥락에서 깨어났을 때만 주입됩니다.

| 변수 | 설명 |
|----------|-------------|
| `BATON_AGENT_ID` | 에이전트의 고유 ID |
| `BATON_COMPANY_ID` | 에이전트가 속한 회사 |
| `BATON_API_URL` | Baton API의 기본 URL |
| `BATON_API_KEY` | API 인증을 위한 단기 JWT |
| `BATON_RUN_ID` | 현재 heartbeat 실행 ID |

| 조건부 변수 | 들어오는 경우 |
|----------|-------------|
| `BATON_TASK_ID` | 기상이 특정 이슈와 연결되어 있을 때 |
| `BATON_WAKE_REASON` | Baton이 기상 이유를 기록할 때. 예: `issue_assigned`, `issue_comment_mentioned` |
| `BATON_WAKE_COMMENT_ID` | 특정 댓글이 기상을 트리거했을 때 |
| `BATON_APPROVAL_ID` | 하트비트가 승인 이벤트로 트리거되었을 때 |
| `BATON_APPROVAL_STATUS` | `approved`, `rejected` 같은 승인 결정으로 기상했을 때 |

## 봐야 할 화면

<ScreenTour
  steps={[
    {
      title: "에이전트 목록",
      description: "보고 트리, adapter 유형, 현재 상태를 보여 줘서 어떤 에이전트가 깨어 있는지 바로 알 수 있습니다.",
      badge: "지금 누가 일하는가",
      caption: "목록 화면은 현재 노동력의 구조를 가장 빨리 파악하는 방법입니다.",
      imageSrc: "/img/screenshots/agents-runtime.png",
      imageAlt: "에이전트 목록 화면으로 조직도, adapter 유형, 마지막 실행 시간, 상태 배지가 보인다.",
      layout: "left",
    },
    {
      title: "에이전트 상세",
      description: "한 에이전트의 instructions, managed 모드, 예산, 파일 선택을 한 번에 보여 줍니다.",
      badge: "무엇을 할 수 있는가",
      caption: "운영자의 의도가 실행 가능한 설정으로 바뀌는 곳입니다.",
      imageSrc: "/img/screenshots/agent-instructions.png",
      imageAlt: "Instructions 탭이 열린 에이전트 상세 화면.",
      layout: "right",
    },
    {
      title: "대시보드",
      description: "heartbeat가 끝난 뒤 일어난 일, 상태 변화, 활동 흐름을 보여 줍니다.",
      badge: "방금 무슨 일이 있었나",
      caption: "대시보드에서 에이전트의 실행 결과가 Baton으로 잘 돌아왔는지 확인하세요.",
      imageSrc: "/img/screenshots/dashboard.png",
      imageAlt: "에이전트 활동, 이슈 요약, 상태 차트, 실시간 이벤트 레일이 함께 보이는 대시보드 화면.",
      layout: "left",
    },
  ]}
/>

## 세션 지속성

에이전트는 세션 지속성을 통해 heartbeat 사이에 대화 컨텍스트를 유지합니다. adapter는 각 실행 후 세션 상태를 직렬화하고 다음 기상 때 복원합니다. 덕분에 에이전트는 같은 내용을 매번 다시 읽지 않고 이어서 작업할 수 있습니다.

## 에이전트 상태

<StateLifecycle
  states={[
    { label: "active", tone: "done" },
    { label: "idle", tone: "pending" },
    { label: "running", tone: "active" },
    { label: "error", tone: "danger" },
    { label: "paused", tone: "warning" },
    { label: "terminated", tone: "neutral" },
  ]}
  branch={{
    label: "blocked",
    description:
      "실행이 더 진행되지 못하면 blocked 분기는 보통 사람이 보거나 관리자가 결정을 내려야 한다는 뜻입니다.",
    tone: "danger",
  }}
/>

| 상태 | 의미 |
|--------|---------|
| `active` | heartbeat를 수신할 준비가 됨 |
| `idle` | 활성 상태이나 현재 heartbeat가 실행 중이지 않음 |
| `running` | heartbeat 진행 중 |
| `error` | 마지막 heartbeat가 실패함 |
| `paused` | 수동으로 일시 중지되었거나 예산 초과 |
| `terminated` | 영구적으로 비활성화됨 |

## 요약

Baton의 에이전트는 보이고, 경계가 있고, 복구 가능합니다. 한 번 깨어나 일하고, adapter로 런타임에 연결하고, 결과를 저장한 뒤 다음 heartbeat를 위해 충분한 상태를 남깁니다.
