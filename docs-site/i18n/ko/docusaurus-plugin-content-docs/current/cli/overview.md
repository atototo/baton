---
title: CLI 개요
description: CLI 설치 및 설정
---

Baton CLI는 인스턴스 설정, 진단, Control Plane 작업을 처리합니다.

## 사용법

```sh
pnpm baton --help
```

## 글로벌 옵션

모든 명령에서 지원됩니다:

| 플래그 | 설명 |
|------|-------------|
| `--data-dir <path>` | 로컬 Baton 데이터 루트 (`~/.baton`과 분리) |
| `--api-base <url>` | API 기본 URL |
| `--api-key <token>` | API 인증 토큰 |
| `--context <path>` | Context 파일 경로 |
| `--profile <name>` | Context 프로필 이름 |
| `--json` | JSON 형식으로 출력 |

회사 범위 명령은 `--company-id <id>`도 사용할 수 있습니다.

깨끗한 로컬 인스턴스를 위해 실행하는 명령에 `--data-dir`을 전달합니다:

```sh
pnpm baton run --data-dir ./tmp/baton-dev
```

## Context 프로필

플래그 반복을 피하기 위해 기본값을 저장합니다:

```sh
# Set defaults
pnpm baton context set --api-base http://localhost:3100 --company-id <id>

# View current context
pnpm baton context show

# List profiles
pnpm baton context list

# Switch profile
pnpm baton context use default
```

시크릿을 context에 저장하지 않으려면 환경 변수를 사용합니다:

```sh
pnpm baton context set --api-key-env-var-name BATON_API_KEY
export BATON_API_KEY=...
```

Context는 `~/.baton/context.json`에 저장됩니다.

## 명령 카테고리

CLI에는 두 가지 카테고리가 있습니다:

1. **[설정 명령](/cli/setup-commands)** — 인스턴스 부트스트랩, 진단, 설정
2. **[Control Plane 명령](/cli/control-plane-commands)** — 이슈, 에이전트, 승인, 활동
