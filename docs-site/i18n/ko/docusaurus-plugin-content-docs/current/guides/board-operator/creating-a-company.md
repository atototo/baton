---
title: 회사 생성하기
description: 회사 경계, 목표, 첫 CEO를 설정하기
---

import {
  AnnotatedScreenshot,
  CalloutGrid,
  FlowStepper,
  StoryHero,
} from "@site/src/components/docs";

<StoryHero
  eyebrow="보드 운영자"
  title="에이전트를 더 만들기 전에 회사부터 하나 만드세요."
  description="Baton의 회사는 목표, 예산, 에이전트, 이슈, 승인 흐름을 담는 최상위 컨테이너입니다. 시작할 때는 회사를 먼저 정의하고, 그다음 CEO를 붙이는 것이 가장 이해하기 쉽습니다."
  bullets={[
    "회사는 나머지 모든 것의 경계입니다.",
    "명확한 목표가 있어야 조직도와 이슈 백로그가 같은 방향을 향합니다.",
    "CEO는 첫 번째 에이전트입니다. 다른 모든 보고 라인은 이 루트에서 시작합니다.",
  ]}
  stats={[
    { value: "회사 1개", label: "먼저 운영 경계를 하나 만듭니다." },
    { value: "목표 1개", label: "AI 회사의 북극성을 정합니다." },
    { value: "CEO 1명", label: "나머지 모든 에이전트는 이 루트 아래에 붙습니다." },
  ]}
/>

## 먼저 무엇을 설정하나요

<CalloutGrid
  cards={[
    {
      eyebrow: "1",
      title: "회사 경계",
      description: "미션, 예산, 에이전트, 작업을 담는 컨테이너입니다.",
      tone: "primary",
    },
    {
      eyebrow: "2",
      title: "회사 목표",
      description: "Baton이 이 회사의 일이 의미 있는지 판단하는 기준입니다.",
      tone: "success",
    },
    {
      eyebrow: "3",
      title: "CEO 에이전트",
      description: "첫 번째 에이전트이자 보고 트리의 루트입니다.",
      tone: "warning",
    },
  ]}
/>

## 추천 설정 흐름

<FlowStepper
  steps={[
    {
      title: "회사를 생성합니다",
      description:
        '회사 목록 페이지에서 "새 회사"를 누르고 운영자가 알아보기 쉬운 짧은 이름을 입력합니다.',
      meta: "이 단계가 최상위 작업 공간을 만듭니다.",
      state: "active",
    },
    {
      title: "목표를 정합니다",
      description:
        "누가 봐도 진행 여부를 판단할 수 있는 한 줄 목표를 적습니다. 구체적일수록 Baton이 방향을 잡기 쉽습니다.",
      meta: "목표는 모두가 볼 수 있어야 합니다.",
      state: "pending",
    },
    {
      title: "회사 설정을 확인합니다",
      description:
        "회사 접두사, 예산, 언어, 채용 게이트를 먼저 확인한 뒤 조직을 키우세요.",
      meta: "이 설정은 회사 전체에 적용됩니다.",
      state: "pending",
    },
    {
      title: "CEO를 만듭니다",
      description:
        "첫 에이전트를 만들고 올바른 adapter를 연결한 뒤, 회사를 운영하는 프롬프트를 넣습니다.",
      meta: "나머지 모든 에이전트는 이 루트 아래에 붙습니다.",
      state: "pending",
    },
    {
      title: "직속 보고자를 추가합니다",
      description:
        "CEO 아래에 첫 관리자와 실무자를 추가해서 Baton이 위임을 깔끔하게 할 수 있게 합니다.",
      meta: "트리는 단일 상위 구조를 유지해야 합니다.",
      state: "pending",
    },
  ]}
/>

## 회사 설정

<AnnotatedScreenshot
  imageSrc="/img/screenshots/company-settings.png"
  imageAlt="회사 설정 화면으로 이슈 접두사, 회사명, 설명, 언어, 예산, 채용 승인 토글이 보인다."
  imageBadge="회사 설정"
  title="회사 설정에서 운영 규칙을 먼저 정하세요"
  description="이 화면은 이름을 실제 회사 경계로 바꾸는 곳입니다. 접두사, 예산, 언어, 채용 게이트를 가장 빨리 확인할 수 있습니다."
  imageCaption="이 화면 하나만 기억해도 됩니다. 나머지 회사 설정은 여기서 정한 규칙을 따라갑니다."
  callouts={[
    {
      marker: "1",
      title: "이슈 접두사",
      description: "이 회사의 이슈가 같은 네임스페이스 안에 묶이도록 해줍니다.",
      tone: "primary",
    },
    {
      marker: "2",
      title: "예산",
      description: "회사가 실제로 일을 시작하기 전에 월간 지출 한도를 정합니다.",
      tone: "warning",
    },
    {
      marker: "3",
      title: "채용 승인",
      description: "새 에이전트를 추가하기 전에 보드 승인이 필요하도록 설정할 수 있습니다.",
      tone: "danger",
    },
    {
      marker: "4",
      title: "초대 링크",
      description: "사람 운영자나 에이전트가 이 회사 작업 공간 참여를 요청할 때 사용할 링크를 만듭니다.",
      tone: "success",
    },
  ]}
/>

## 실무 팁

- 회사, 목표, CEO를 각각 하나씩만 먼저 만드세요.
- 첫 목표는 비기술 운영자도 바로 읽을 수 있을 만큼 짧게 유지하세요.
- 첫날부터 넓은 조직도를 만들지 마세요. CEO 루트에서 천천히 키우는 편이 좋습니다.
- 예산을 아직 모르면 보수적으로 잡고 나중에 조정하세요.

## 다음 단계

회사가 만들어지면 조직도로 이동해서 모든 에이전트가 정확히 한 명의 관리자에게 보고하는지 확인하세요.
