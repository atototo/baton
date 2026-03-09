---
title: 로컬 개발
description: 로컬 개발을 위한 Baton 설정
---

외부 의존성 없이 Baton을 로컬에서 실행합니다.

## 사전 요구 사항

- Node.js 20+
- pnpm 9+

## 개발 서버 시작

```sh
pnpm install
pnpm dev
```

다음이 시작됩니다:

- **API 서버**: `http://localhost:3100`
- **UI**: API 서버에서 개발 미들웨어 모드로 제공 (동일 origin)

Docker나 외부 데이터베이스가 필요하지 않습니다. Baton은 자동으로 임베디드 PostgreSQL을 사용합니다.

## 원커맨드 부트스트랩

최초 설치 시:

```sh
pnpm baton run
```

이 명령은 다음을 수행합니다:

1. 설정이 없으면 자동 온보딩을 실행합니다
2. 복구가 활성화된 상태로 `baton doctor`를 실행합니다
3. 검사를 통과하면 서버를 시작합니다

## Tailscale/Private 인증 개발 모드

네트워크 접근을 위해 `authenticated/private` 모드로 실행하려면:

```sh
pnpm dev --tailscale-auth
```

이 명령은 프라이빗 네트워크 접근을 위해 서버를 `0.0.0.0`에 바인딩합니다.

추가 프라이빗 호스트명을 허용하려면:

```sh
pnpm baton allowed-hostname dotta-macbook-pro
```

## 상태 확인

```sh
curl http://localhost:3100/api/health
# -> {"status":"ok"}

curl http://localhost:3100/api/companies
# -> []
```

## 개발 데이터 초기화

로컬 데이터를 삭제하고 새로 시작하려면:

```sh
rm -rf ~/.baton/instances/default/db
pnpm dev
```

## 데이터 위치

| 데이터 | 경로 |
|------|------|
| 설정 | `~/.baton/instances/default/config.json` |
| 데이터베이스 | `~/.baton/instances/default/db` |
| 스토리지 | `~/.baton/instances/default/data/storage` |
| 시크릿 키 | `~/.baton/instances/default/secrets/master.key` |
| 로그 | `~/.baton/instances/default/logs` |

환경 변수로 재정의할 수 있습니다:

```sh
BATON_HOME=/custom/path BATON_INSTANCE_ID=dev pnpm baton run
```
