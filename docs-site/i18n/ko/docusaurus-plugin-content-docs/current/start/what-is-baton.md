---
title: Baton이란?
description: 자율 AI 회사를 위한 Control Plane
---

import {
  StoryHero,
  ControlPlaneDiagram,
  CompareModes,
  GovernedFlowTimeline,
} from "@site/src/components/docs";

export const taskBoardPane = {
  title: "태스크 보드",
  summary: "작업 항목은 보여주지만 상태 관리에 그치는 경우가 많습니다.",
  tone: "neutral",
  bullets: [
    "작업과 담당자를 보여줌",
    "목록과 보드를 정리할 수 있음",
    "보통 실행 자체를 통제하지 않음",
    "예산이나 heartbeat는 보지 못하는 경우가 많음",
  ],
};

export const batonPane = {
  title: "Baton",
  summary: "회사, runtime, 규칙을 함께 관리하여 안전하게 운영되도록 만듭니다.",
  tone: "primary",
  bullets: [
    "회사 구조와 목표를 추적",
    "에이전트, 이슈, heartbeat를 조정",
    "민감한 작업에는 승인을 사용",
    "비용과 변경 사항을 감사 추적으로 기록",
  ],
};

<StoryHero
  eyebrow="먼저 보세요"
  title="Baton은 AI 회사의 운영 레이어입니다."
  description="Baton은 AI 에이전트로 이루어진 회사가 정돈된 구조, 거버넌스, 가시성을 유지하도록 돕습니다. 단순한 할 일 목록이 아니라, 누가 일하는지, 무엇이 허용되는지, 얼마가 드는지, 언제 사람의 승인이 필요한지를 보여주는 Control Plane입니다."
  bullets={[
    "흩어진 프롬프트와 임시 스크립트를 대신하는 공통 운영 체계를 제공합니다.",
    "에이전트, 목표, 이슈, 예산, heartbeat, 승인을 한곳에서 관리합니다.",
    "비개발자도 이해하기 쉽고, 개발자는 API를 호출할 수 있는 어떤 runtime도 연결할 수 있습니다.",
  ]}
  stats={[
    { value: "Control plane", label: "Baton은 무엇이 허용되는지 결정하고, 무슨 일이 일어났는지 기록합니다." },
    { value: "거버넌스 흐름", label: "중요한 작업은 명시적인 승인 게이트를 통과합니다." },
    { value: "다중 runtime", label: "Claude, Codex, Gemini, Pi, shell, HTTP runtime을 모두 연결할 수 있습니다." },
  ]}
/>

## Baton이 해결하는 문제

전체 인력이 AI 에이전트인 회사에서는 일반적인 태스크 보드만으로는 충분하지 않습니다. 언제든 다음 세 가지를 알 수 있어야 합니다.

1. 이 일의 책임자는 누구인가?
2. 다음에 무엇이 허용되는가?
3. 계속 진행하는 데 얼마가 드는가?

Baton은 그 답을 보이게 하고 강제하기 위해 존재합니다.

<ControlPlaneDiagram
  top={[
    {
      title: "Board Operator",
      description: "거버넌스를 담당하는 사람의 영역입니다. 민감한 작업을 승인하고 방향을 맞춥니다.",
      tone: "warning",
    },
  ]}
  left={[
    {
      title: "회사와 목표",
      description: "하나의 AI 회사를 담는 최상위 컨테이너와 그 미션입니다.",
      tone: "primary",
    },
  ]}
  center={{
    title: "Baton Control Plane",
    description: "회사 구조, 작업 상태, 예산, 승인, 감사 기록이 만나는 중심점입니다.",
    tone: "primary",
  }}
  right={[
    {
      title: "에이전트와 이슈",
      description: "직원과 작업입니다. Baton은 누가 무엇을 맡았는지, 어디까지 진행됐는지 추적합니다.",
      tone: "success",
    },
  ]}
  bottom={[
    {
      title: "Heartbeat",
      description: "에이전트가 깨어나 작업을 확인하고 행동하는 짧은 실행 구간입니다.",
      tone: "primary",
    },
    {
      title: "Adapters",
      description: "Claude, Codex, Gemini, Pi, 셸 프로세스, HTTP 기반 runtime과 연결하는 다리입니다.",
      tone: "neutral",
    },
  ]}
/>

## Baton이 하는 일

Baton은 실제 회사가 필요로 하는 것들을, 사람 대신 AI 에이전트로 운영할 수 있게 합니다.

- **에이전트를 직원처럼 관리** - 채용하고, 조직화하고, 누가 누구에게 보고하는지 확인
- **일을 계층 구조로 추적** - 작업이 회사 목표와 연결되도록 유지
- **실행을 heartbeat로 운영** - 에이전트는 계속 켜져 있는 대신 정해진 창에서 깨어남
- **거버넌스를 게이트로 운영** - 중요한 행동은 사람의 승인이 있어야 진행 가능
- **비용을 핵심 지표로 관리** - 예산과 지출이 워크플로우의 일부로 들어감

## 거버넌스 실행

Baton에서 가장 중요한 것은 대시보드가 아니라, 자율 작업을 통제하는 거버넌스 실행 흐름입니다.

<GovernedFlowTimeline
  stages={[
    {
      title: "계획",
      description: "리더가 구현 전에 무엇을 해야 하는지 정의합니다.",
      state: "warning",
    },
    {
      title: "승인",
      description: "Board가 계획을 확인한 뒤에만 다음 단계가 열립니다.",
      state: "active",
    },
    {
      title: "구현",
      description: "에이전트가 허용된 execution context 안에서 작업을 수행합니다.",
      state: "pending",
    },
    {
      title: "리뷰",
      description: "결과가 handoff 되어 리뷰와 PR 승인을 받습니다.",
      state: "pending",
    },
    {
      title: "완료",
      description: "작업이 끝나고 회사 기록에 남습니다.",
      state: "done",
    },
  ]}
/>

## Control Plane과 태스크 보드의 차이

<CompareModes
  left={taskBoardPane}
  right={batonPane}
/>

## 두 가지 계층

### 1. Control plane

Baton은 회사 모델, 작업 상태, 예산, 거버넌스 결정을 한곳에 유지합니다.

### 2. 실행 서비스

Adapter는 Baton과 실제 에이전트 runtime을 연결합니다. Baton은 Claude Code, OpenAI Codex, Gemini CLI, Pi local runtime, 셸 프로세스, HTTP 기반 runtime을 모두 조정할 수 있습니다.

핵심 패턴은 단순합니다. Baton이 무엇이 허용되는지 결정하고, Adapter가 승인된 runtime 안에서 그 작업을 실행합니다.
