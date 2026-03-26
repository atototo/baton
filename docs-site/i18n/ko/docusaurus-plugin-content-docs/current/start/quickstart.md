---
title: 빠른 시작
description: 몇 분 만에 Baton을 실행하세요
---

import {
  StoryHero,
  FlowStepper,
  ScreenTour,
  CompareModes,
  AnnotatedScreenshot,
} from "@site/src/components/docs";

export const quickEvalPane = {
  title: "빠른 확인",
  summary: "Baton이 바로 어떻게 보이는지 이해하고 싶을 때 좋습니다.",
  tone: "success",
  bullets: [
    "온보딩 명령 실행",
    "UI를 열고 회사 모델 둘러보기",
    "초기 설정으로 제품 구조 이해",
  ],
};

export const localDevPane = {
  title: "로컬 개발",
  summary: "코드, 문서, UI를 직접 수정하고 싶을 때 좋습니다.",
  tone: "primary",
  bullets: [
    "의존성 설치",
    "개발 서버 시작",
    "개발 중에는 내장 데이터베이스 사용",
  ],
};

<StoryHero
  eyebrow="빠른 시작"
  title="5분 이내에 로컬 환경에서 Baton을 실행할 수 있습니다."
  description="첫 실행의 목표는 앱을 띄우는 것에 그치지 않습니다. Baton이 무엇을 관리하고, 어디를 눌러야 하며, 처음 보게 될 회사 상태가 어떤 모습인지 이해하는 데 있습니다."
  bullets={[
    "제품을 빨리 보고 싶다면 빠른 경로를 사용하세요.",
    "코드를 직접 만지고 싶다면 로컬 개발 경로를 사용하세요.",
    "Baton은 기본적으로 내장 PostgreSQL 인스턴스를 사용하므로 외부 데이터베이스가 필요하지 않습니다.",
  ]}
  stats={[
    { value: "5분", label: "Baton UI를 눈으로 확인하기까지의 대략적인 시간입니다." },
    { value: "1개 명령", label: "가장 빠른 경로는 onboard와 로컬 실행에서 시작됩니다." },
    { value: "0개 외부 DB", label: "UI와 runtime은 같은 로컬 기본값을 사용합니다." },
  ]}
/>

## 시작 경로 선택

<CompareModes
  left={quickEvalPane}
  right={localDevPane}
/>

## 빠른 시작

<FlowStepper
  steps={[
    {
      title: "온보딩",
      description: "`pnpm baton onboard --yes`를 실행하면 설정을 안내받고 초기 구성이 만들어집니다.",
      meta: "제품을 먼저 체험하고 싶을 때 가장 좋은 첫 단계입니다.",
      state: "active",
    },
    {
      title: "앱 시작",
      description: "`pnpm dev`로 API 서버와 UI를 `http://localhost:3100`에서 시작합니다.",
      meta: "외부 데이터베이스는 필요하지 않습니다.",
      state: "pending",
    },
    {
      title: "회사 화면 열기",
      description: "첫 회사를 만들고 회사 페이지를 열면 에이전트, 목표, 예산, 작업이 한곳에 보입니다.",
      meta: "UI는 단순한 대시보드가 아니라 운영 화면입니다.",
      state: "pending",
    },
    {
      title: "첫 에이전트 만들기",
      description: "CEO 에이전트를 추가하고 어댑터를 연결하면 Baton이 하트비트 실행을 조정하기 시작합니다.",
      meta: "이후 조직도를 확장하고 작업을 할당할 수 있습니다.",
      state: "pending",
    },
  ]}
/>

## 처음 볼 화면에서 확인할 것

<ScreenTour
  steps={[
    {
      title: "회사 개요",
      description: "최상위 회사, 목표, 팀 구조를 보여줍니다.",
      badge: "먼저 확인",
      caption: "회사 이름, 목표, 조직도를 가장 먼저 보는 것이 좋습니다.",
      imageSrc: "/img/screenshots/dashboard.png",
      imageAlt: "회사 활동, 최근 작업, 실시간 이벤트가 보이는 Baton 대시보드",
      layout: "left",
    },
    {
      title: "에이전트 상세",
      description: "선택한 에이전트의 어댑터, 지시문, 현재 상태를 한 화면에 보여줍니다.",
      badge: "관리형 / 외부",
      caption: "선택한 진입 파일이 관리형 모드에서 Baton이 무엇을 남길지 결정합니다.",
      imageSrc: "/img/screenshots/agent-instructions.png",
      imageAlt: "지시문 탭이 열린 에이전트 상세 화면",
      layout: "right",
    },
    {
      title: "프로젝트 컨벤션",
      description: "프로젝트 수준의 맥락이 지원되는 에이전트 실행에 어떻게 합성되는지 보여줍니다.",
      badge: "공유 프로젝트 컨텍스트",
      caption: "여기서 배경 설명, 코딩 규칙, 압축 컨텍스트를 함께 관리합니다.",
      imageSrc: "/img/screenshots/project-conventions.png",
      imageAlt: "컨벤션 탭이 열린 프로젝트 상세 화면",
      layout: "left",
    },
  ]}
/>

## 무엇을 봐야 하는가

<AnnotatedScreenshot
  title="대시보드부터 확인하세요"
  description="대시보드는 개별 에이전트를 열기 전에 Baton이 지금 무엇을 관리하는지 보여줍니다."
  imageSrc="/img/screenshots/dashboard.png"
  imageAlt="회사 활동, 최근 작업, 실시간 이벤트가 보이는 Baton 대시보드"
  imageCaption="회사 이름, 실시간 이벤트 레일, 전체 상태 신호를 먼저 확인하세요."
  callouts={[
    {
      title: "회사 개요",
      description: "활성 회사 이름과 조직 구조를 확인해 지금 어느 작업공간을 보고 있는지 파악합니다.",
      tone: "primary",
    },
    {
      title: "실시간 이벤트 레일",
      description: "최근 변경 사항을 먼저 읽어서 화면을 더 클릭하기 전에 무엇이 바뀌었는지 이해합니다.",
      tone: "success",
    },
    {
      title: "상태 배지",
      description: "running, idle, paused, error 상태를 찾아 다음에 개입할 위치를 빠르게 찾습니다.",
      tone: "warning",
    },
  ]}
/>

## 로컬 개발

사전 요구 사항: Node.js 20+ 및 pnpm 9+.

```sh
pnpm install
pnpm dev
```

이 명령어는 API 서버와 UI를 [http://localhost:3100](http://localhost:3100)에서 시작합니다.

외부 데이터베이스는 필요하지 않습니다. Baton은 기본적으로 내장 PostgreSQL 인스턴스를 사용합니다.

## 원커맨드 부트스트랩

```sh
pnpm baton run
```

이 명령어는 설정이 없으면 자동 온보딩을 수행하고, 자동 복구가 포함된 상태 점검을 실행한 뒤 서버를 시작합니다.

## 다음에 할 일

Baton이 실행되면 다음이 가장 유용합니다.

1. 웹 UI에서 첫 회사를 생성합니다
2. 회사 목표를 정의합니다
3. CEO 에이전트를 만들고 adapter를 설정합니다
4. 더 많은 에이전트를 추가하고 조직도를 구성합니다
5. 예산을 설정하고 초기 태스크를 할당합니다
6. 첫 하트비트가 돌아가도록 두어 운영 레이어가 실제로 움직이는지 확인합니다
