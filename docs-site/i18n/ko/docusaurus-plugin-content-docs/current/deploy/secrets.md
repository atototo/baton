---
title: 시크릿 관리
description: 마스터 키, 암호화, 및 strict 모드
---

Baton은 로컬 마스터 키를 사용하여 시크릿을 저장 시 암호화합니다. 민감한 값(API 키, 토큰)을 포함하는 에이전트 환경 변수는 암호화된 시크릿 참조로 저장됩니다.

## 기본 제공자: `local_encrypted`

시크릿은 다음 위치에 저장된 로컬 마스터 키로 암호화됩니다:

```
~/.baton/instances/default/secrets/master.key
```

이 키는 온보딩 중에 자동으로 생성됩니다. 키는 사용자의 머신을 벗어나지 않습니다.

## 설정

### CLI 설정

온보딩 시 기본 시크릿 설정이 작성됩니다:

```sh
pnpm baton onboard
```

시크릿 설정을 변경합니다:

```sh
pnpm baton configure --section secrets
```

시크릿 설정을 검증합니다:

```sh
pnpm baton doctor
```

### 환경 변수 재정의

| 변수 | 설명 |
|----------|-------------|
| `BATON_SECRETS_MASTER_KEY` | base64, hex, 또는 원시 문자열 형태의 32바이트 키 |
| `BATON_SECRETS_MASTER_KEY_FILE` | 커스텀 키 파일 경로 |
| `BATON_SECRETS_STRICT_MODE` | `true`로 설정하여 시크릿 참조를 강제합니다 |

## Strict 모드

Strict 모드가 활성화되면 민감한 환경 변수 키(`*_API_KEY`, `*_TOKEN`, `*_SECRET` 패턴과 일치하는)는 인라인 평문 값 대신 시크릿 참조를 사용해야 합니다.

```sh
BATON_SECRETS_STRICT_MODE=true
```

local trusted 이외의 모든 배포 환경에서 권장됩니다.

## 인라인 시크릿 마이그레이션

기존 에이전트 설정에 인라인 API 키가 있는 경우, 암호화된 시크릿 참조로 마이그레이션합니다:

```sh
pnpm secrets:migrate-inline-env         # 드라이 런
pnpm secrets:migrate-inline-env --apply # 마이그레이션 적용
```

## 에이전트 설정에서의 시크릿 참조

에이전트 환경 변수는 시크릿 참조를 사용합니다:

```json
{
  "env": {
    "ANTHROPIC_API_KEY": {
      "type": "secret_ref",
      "secretId": "8f884973-c29b-44e4-8ea3-6413437f8081",
      "version": "latest"
    }
  }
}
```

서버는 런타임에 이를 해석하고 복호화하여 실제 값을 에이전트 프로세스 환경에 주입합니다.
