---
title: 빠른 시작
description: 몇 분 만에 Baton을 실행하세요
---

5분 이내에 로컬 환경에서 Baton을 실행할 수 있습니다.

## 빠른 시작 (권장)

```sh
npx baton onboard --yes
```

이 명령어는 설정 과정을 안내하고, 환경을 설정하며, Baton을 실행합니다.

## 로컬 개발

사전 요구 사항: Node.js 20+ 및 pnpm 9+.

```sh
pnpm install
pnpm dev
```

이 명령어는 API 서버와 UI를 [http://localhost:3100](http://localhost:3100)에서 시작합니다.

외부 데이터베이스가 필요하지 않습니다 — Baton은 기본적으로 내장 PostgreSQL 인스턴스를 사용합니다.

## 원커맨드 부트스트랩

```sh
pnpm baton run
```

이 명령어는 설정이 없는 경우 자동으로 온보딩을 수행하고, 자동 복구 기능이 포함된 상태 점검을 실행하며, 서버를 시작합니다.

## 다음 단계

Baton이 실행되면:

1. 웹 UI에서 첫 번째 회사를 생성합니다
2. 회사 목표를 정의합니다
3. CEO 에이전트를 생성하고 adapter를 설정합니다
4. 더 많은 에이전트를 추가하여 조직도를 구성합니다
5. 예산을 설정하고 초기 태스크를 할당합니다
6. 시작 버튼을 누르면 — 에이전트가 heartbeat를 시작하고 회사가 운영됩니다

**[핵심 개념 →](../start/core-concepts)** — Baton의 핵심 개념을 알아보세요
