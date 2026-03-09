---
title: 설정 명령
description: 온보딩, 실행, 진단 및 설정
---

인스턴스 설정 및 진단 명령입니다.

## `baton run`

단일 명령으로 부트스트랩 및 시작합니다:

```sh
pnpm baton run
```

수행 내용:

1. 설정이 없는 경우 자동으로 온보딩합니다
2. 복구 기능이 활성화된 상태로 `baton doctor`를 실행합니다
3. 검사가 통과하면 서버를 시작합니다

특정 인스턴스를 선택합니다:

```sh
pnpm baton run --instance dev
```

## `baton onboard`

대화형 초기 설정입니다:

```sh
pnpm baton onboard
```

첫 번째 프롬프트:

1. `Quickstart` (권장): 로컬 기본값 (내장 데이터베이스, LLM 프로바이더 없음, 로컬 디스크 스토리지, 기본 시크릿)
2. `Advanced setup`: 전체 대화형 설정

온보딩 후 즉시 시작합니다:

```sh
pnpm baton onboard --run
```

비대화형 기본값 + 즉시 시작 (서버 리슨 시 브라우저 열기):

```sh
pnpm baton onboard --yes
```

## `baton doctor`

선택적 자동 복구를 포함한 상태 검사입니다:

```sh
pnpm baton doctor
pnpm baton doctor --repair
```

검증 항목:

- 서버 설정
- 데이터베이스 연결
- 시크릿 adapter 설정
- 스토리지 설정
- 누락된 키 파일

## `baton configure`

설정 섹션을 업데이트합니다:

```sh
pnpm baton configure --section server
pnpm baton configure --section secrets
pnpm baton configure --section storage
```

## `baton env`

확인된 환경 설정을 표시합니다:

```sh
pnpm baton env
```

## `baton allowed-hostname`

인증/프라이빗 모드에서 프라이빗 호스트네임을 허용합니다:

```sh
pnpm baton allowed-hostname my-tailscale-host
```

## 로컬 스토리지 경로

| 데이터 | 기본 경로 |
|------|-------------|
| 설정 | `~/.baton/instances/default/config.json` |
| 데이터베이스 | `~/.baton/instances/default/db` |
| 로그 | `~/.baton/instances/default/logs` |
| 스토리지 | `~/.baton/instances/default/data/storage` |
| 시크릿 키 | `~/.baton/instances/default/secrets/master.key` |

다음으로 재정의합니다:

```sh
BATON_HOME=/custom/home BATON_INSTANCE_ID=dev pnpm baton run
```

또는 모든 명령에 `--data-dir`을 직접 전달합니다:

```sh
pnpm baton run --data-dir ./tmp/baton-dev
pnpm baton doctor --data-dir ./tmp/baton-dev
```
