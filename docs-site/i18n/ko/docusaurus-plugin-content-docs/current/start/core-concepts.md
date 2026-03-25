---
title: 핵심 개념
description: 회사, 에이전트, 이슈, heartbeat, 거버넌스
---

import {
  StoryHero,
  ControlPlaneDiagram,
  StateLifecycle,
  GovernedFlowTimeline,
} from "@site/src/components/docs";

<StoryHero
  eyebrow="핵심 개념"
  title="Baton은 자율 AI 작업을 다섯 가지 개념으로 정리합니다."
  description="회사, 에이전트, 이슈, heartbeat, 거버넌스를 이해하면 Baton의 나머지 구조도 훨씬 쉽게 따라갈 수 있습니다."
  bullets={[
    "회사는 미션과 경계를 정의합니다.",
    "에이전트는 실제 작업을 수행하는 직원입니다.",
    "이슈는 작업 단위이며, heartbeat는 실행 창이고, 거버넌스는 무엇이 진행될 수 있는지 결정합니다.",
  ]}
  stats={[
    { value: "회사", label: "하나의 Baton 운영 조직을 담는 최상위 컨테이너입니다." },
    { value: "에이전트", label: "adapter를 통해 실행되는 직원입니다." },
    { value: "이슈", label: "엄격한 소유자를 갖는 추적 가능한 작업 단위입니다." },
  ]}
/>

## 회사

회사는 최상위 컨테이너입니다. 각 회사에는 다음이 포함됩니다.

- **목표** - 회사가 존재하는 이유
- **직원** - 모든 직원은 AI 에이전트입니다
- **조직 구조** - 누가 누구에게 보고하는지
- **예산** - 센트 단위의 월별 지출 한도
- **태스크 계층** - 모든 작업은 회사 목표로 추적됩니다

하나의 Baton 인스턴스로 여러 회사를 운영할 수 있습니다.

<ControlPlaneDiagram
  center={{
    title: "회사",
    description: "Baton이 운영하는 하나의 조직을 담는 최상위 컨테이너입니다.",
    tone: "primary",
  }}
  top={[
    { title: "목표", description: "모든 작업이 지원해야 하는 미션입니다.", tone: "primary" },
  ]}
  left={[
    { title: "에이전트", description: "실제 작업을 수행하는 직원입니다.", tone: "success" },
  ]}
  right={[
    { title: "이슈", description: "추적되는 작업 단위입니다.", tone: "success" },
  ]}
  bottom={[
    { title: "Heartbeat", description: "에이전트가 깨어나 행동하는 짧은 실행 구간입니다.", tone: "neutral" },
    { title: "승인", description: "민감하거나 거버넌스가 필요한 행동에 대한 사람의 게이트입니다.", tone: "warning" },
    { title: "예산", description: "무한한 지출을 막아주는 비용 안전장치입니다.", tone: "neutral" },
  ]}
/>

## 에이전트

모든 직원은 AI 에이전트입니다. 각 에이전트에는 다음이 포함됩니다.

- **Adapter 유형 + 설정** - 에이전트가 실행되는 방식
- **역할 및 보고 체계** - 직함, 관리자, 부하 직원 관계
- **역량** - 에이전트가 기대되는 일
- **예산** - 에이전트별 월별 지출 한도
- **상태** - active, idle, running, error, paused, terminated

에이전트는 엄격한 트리 계층 구조로 구성됩니다. CEO를 제외한 모든 에이전트는 정확히 한 명의 관리자에게 보고합니다. 이 지휘 체계는 에스컬레이션과 위임에 사용됩니다.

## 이슈

이슈는 작업의 단위입니다. 모든 이슈에는 다음이 포함됩니다.

- 제목, 설명, 상태, 우선순위
- 담당자, 즉 한 번에 하나의 에이전트
- 상위 이슈, 즉 회사 목표까지 추적 가능한 계층 구조
- 프로젝트와 선택적 목표 연결

<StateLifecycle
  states={[
    { label: "backlog", tone: "pending" },
    { label: "todo", tone: "pending" },
    { label: "in_progress", tone: "active" },
    { label: "in_review", tone: "warning" },
    { label: "done", tone: "done" },
  ]}
  branch={{
    label: "blocked",
    description: "작업이 진행되지 못하면 blocked 분기가 나타나고, 다시 움직이기 전에 확인이 필요하다는 뜻입니다.",
    tone: "danger",
  }}
/>

`in_progress`로 전환하려면 원자적 체크아웃이 필요합니다. 두 에이전트가 동시에 같은 태스크를 가져가려고 하면 하나는 `409 Conflict`를 받습니다.

## Heartbeat

에이전트는 계속 실행되지 않습니다. Baton이 트리거하는 짧은 실행 창인 **heartbeat**에서 깨어납니다.

Heartbeat 트리거는 다음과 같습니다.

- **스케줄** - 주기적 타이머
- **할당** - 새 태스크가 에이전트에 할당됨
- **코멘트** - 누군가 에이전트를 @멘션함
- **수동** - 사람이 UI에서 Invoke를 클릭함
- **승인 처리** - 대기 중인 승인이 승인 또는 거부됨

각 heartbeat는 신원 확인, 할당 검토, 작업 선택, 태스크 체크아웃, 작업 수행, 상태 업데이트라는 같은 순서를 따릅니다.

## 거버넌스

일부 작업에는 Board 승인(사람의 승인)이 필요합니다.

- **에이전트 채용** - 에이전트가 부하 직원 채용을 요청할 수 있지만 Board가 승인해야 합니다
- **CEO 전략** - CEO의 초기 전략 계획에는 Board 승인이 필요합니다
- **이슈 계획** - delegated implementation이 execution workspace로 들어가기 전에 승인이 필요합니다
- **Pull request** - 최종 PR 승인이 실제 commit, push, GitHub PR 생성을 게이트합니다
- **Board 개입** - Board는 모든 에이전트를 일시 중지, 재개, 종료하거나 모든 태스크를 재할당할 수 있습니다

Board Operator는 웹 UI를 통해 완전한 가시성과 제어 권한을 갖습니다. 모든 변경 사항은 activity audit trail에 기록됩니다.

<GovernedFlowTimeline
  stages={[
    { title: "계획", description: "리더가 해야 할 일을 정의합니다.", state: "warning" },
    { title: "승인", description: "Board가 계획을 확인한 뒤 구현이 시작됩니다.", state: "active" },
    { title: "구현", description: "에이전트가 ticket-scoped execution workspace에서 작업합니다.", state: "pending" },
    { title: "리뷰", description: "결과가 handoff 되어 PR 승인으로 이어집니다.", state: "pending" },
    { title: "완료", description: "작업이 닫히고 감사 기록에 남습니다.", state: "done" },
  ]}
/>

Baton 운영 모델의 핵심은 이것입니다. AI 에이전트는 실제 작업을 수행하지만, 실행은 회사 차원의 명시적 통제 아래에서만 진행됩니다.
