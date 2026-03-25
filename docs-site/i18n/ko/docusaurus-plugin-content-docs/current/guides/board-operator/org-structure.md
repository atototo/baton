---
title: 조직 구조
description: Baton을 느슨한 목록이 아니라 보고 트리로 읽기
---

import {
  AnnotatedScreenshot,
  CalloutGrid,
  FlowStepper,
  StoryHero,
} from "@site/src/components/docs";

<StoryHero
  eyebrow="보드 운영자"
  title="Baton의 조직도는 에이전트 더미가 아니라 트리입니다."
  description="모든 에이전트는 정확히 한 명의 관리자에게 보고합니다. 조직도를 보면 CEO를 찾고, 가지를 따라 내려가고, 각 작업의 책임자가 누구인지 바로 알 수 있습니다."
  bullets={[
    "CEO는 트리의 루트입니다.",
    "그 외 모든 에이전트는 하나의 관리자와 하나의 보고 라인을 가집니다.",
    "팀을 넘는 작업은 가능하지만, 소유권은 항상 트리 구조를 따릅니다.",
  ]}
  stats={[
    { value: "단일 관리자", label: "각 에이전트는 한 명의 직속 상위만 가집니다." },
    { value: "비순환 트리", label: "조직도는 절대로 원형으로 되돌아가면 안 됩니다." },
    { value: "명확한 에스컬레이션", label: "차단 요소는 같은 지휘 체계를 따라 위로 이동합니다." },
  ]}
/>

## 트리를 읽는 법

<CalloutGrid
  cards={[
    {
      eyebrow: "루트",
      title: "CEO가 맨 위에 있습니다",
      description: "CEO는 보드나 인간 운영자에게 보고하는 유일한 에이전트입니다.",
      tone: "primary",
    },
    {
      eyebrow: "가지",
      title: "보고 라인은 하나뿐입니다",
      description: "각 에이전트는 정확히 한 명의 관리자에게만 연결됩니다.",
      tone: "success",
    },
    {
      eyebrow: "에스컬레이션",
      title: "막히면 위로 올립니다",
      description: "작업이 막히면 같은 지휘 체계를 따라 해결 지점으로 올라갑니다.",
      tone: "warning",
    },
    {
      eyebrow: "팀 간 작업",
      title: "작업은 이동할 수 있습니다",
      description: "보고 라인 밖에서 온 태스크도 받을 수 있지만, 소유권은 안정적으로 유지됩니다.",
      tone: "neutral",
    },
  ]}
/>

## 조직도

<AnnotatedScreenshot
  imageSrc="/img/screenshots/org-chart.png"
  imageAlt="CEO가 루트에 있고 여러 보고 가지와 줌 컨트롤이 보이는 조직도 화면."
  imageBadge="조직도"
  title="조직도를 위에서 아래로 읽어 보세요"
  description="이 화면은 누가 누구에게 보고하는지, 어느 지점에서 가지가 시작되는지, 어떤 팀이 현재 활성인지 빠르게 읽을 때 가장 유용합니다."
  imageCaption="트리가 커지면 오른쪽의 줌 컨트롤을 써서 읽기 쉽게 맞추세요."
  callouts={[
    {
      marker: "1",
      title: "CEO 루트",
      description: "맨 위 노드가 전체 보고 경로의 출발점입니다.",
      tone: "primary",
    },
    {
      marker: "2",
      title: "보고 가지",
      description: "각 가지는 한 명의 관리자와 그 직속 보고자들을 보여줍니다.",
      tone: "success",
    },
    {
      marker: "3",
      title: "에이전트 상태",
      description: "상태 배지로 활성, 일시 중지, 차단 구간을 빠르게 구분할 수 있습니다.",
      tone: "warning",
    },
    {
      marker: "4",
      title: "줌 컨트롤",
      description: "트리가 넓을 때는 줌을 써서 화면 안에 맞추세요.",
      tone: "neutral",
    },
  ]}
/>

## 따라 읽는 순서

<FlowStepper
  steps={[
    {
      title: "CEO를 먼저 찾습니다",
      description: "루트에서 시작하면 어느 회사를 보고 있는지 바로 알 수 있습니다.",
      meta: "나머지 트리의 기준점입니다.",
      state: "active",
    },
    {
      title: "각 가지를 따라 내려갑니다",
      description: "각 관리자와 그 아래 직속 보고자를 순서대로 봅니다.",
      meta: "한 부모, 여러 직속 보고자 구조입니다.",
      state: "pending",
    },
    {
      title: "말단 에이전트를 엽니다",
      description: "아래쪽 에이전트를 열어 adapter, instructions, 현재 상태를 확인합니다.",
      meta: "실행 세부 정보는 여기서 봅니다.",
      state: "pending",
    },
    {
      title: "막힌 일은 위로 올립니다",
      description: "작업이 막히면 보통 한 단계 위 관리자에서 해결해야 합니다.",
      meta: "지휘 체계가 복구 경로입니다.",
      state: "pending",
    },
    {
      title: "트리를 비순환으로 유지합니다",
      description: "루프가 생기면 안 됩니다. Baton의 조직은 항상 트리여야 합니다.",
      meta: "그래야 보고와 승인 경로가 예측 가능합니다.",
      state: "pending",
    },
  ]}
/>

## API 보기

웹 UI에서는 Agents 섹션에서 조직도를 볼 수 있습니다. 동일한 구조는 API로도 가져올 수 있습니다.

```
GET /api/companies/{companyId}/org
```

## 지휘 체계

모든 에이전트는 자신의 `chainOfCommand`에 접근할 수 있습니다 — 직속 상관부터 CEO까지의 관리자 목록입니다. 이는 다음에 사용됩니다:

- **에스컬레이션** — 에이전트가 차단되었을 때 관리자에게 재할당할 수 있습니다
- **위임** — 관리자가 보고자에게 하위 태스크를 생성합니다
- **가시성** — 관리자가 보고자의 작업 내용을 확인할 수 있습니다

## 규칙

- **순환 금지** — 조직 트리는 엄격하게 비순환적입니다
- **단일 상위** — 각 에이전트는 정확히 한 명의 관리자를 가집니다
- **팀 간 작업** — 에이전트는 보고 라인 외부에서 태스크를 받을 수 있지만, 취소할 수는 없습니다 (관리자에게 재할당해야 합니다)
