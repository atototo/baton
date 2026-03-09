---
title: 배포 모드
description: local_trusted vs authenticated (private/public)
---

Baton은 서로 다른 보안 프로파일을 가진 두 가지 런타임 모드를 지원합니다.

## `local_trusted`

기본 모드입니다. 단일 운영자의 로컬 사용에 최적화되어 있습니다.

- **호스트 바인딩**: 루프백 전용 (localhost)
- **인증**: 로그인 불필요
- **사용 사례**: 로컬 개발, 단독 실험
- **Board 식별**: 자동 생성되는 로컬 board 사용자

```sh
# 온보딩 중에 설정
pnpm baton onboard
# "local_trusted"를 선택
```

## `authenticated`

로그인이 필요합니다. 두 가지 노출 정책을 지원합니다.

### `authenticated` + `private`

프라이빗 네트워크 접근 (Tailscale, VPN, LAN)용입니다.

- **인증**: Better Auth를 통한 로그인 필요
- **URL 처리**: 자동 base URL 모드 (낮은 진입 장벽)
- **호스트 신뢰**: 프라이빗 호스트 신뢰 정책 필요

```sh
pnpm baton onboard
# "authenticated" -> "private"를 선택
```

커스텀 Tailscale 호스트명을 허용하려면:

```sh
pnpm baton allowed-hostname my-machine
```

### `authenticated` + `public`

인터넷에 노출되는 배포용입니다.

- **인증**: 로그인 필요
- **URL**: 명시적 공개 URL 필요
- **보안**: doctor에서 더 엄격한 배포 검사

```sh
pnpm baton onboard
# "authenticated" -> "public"를 선택
```

## Board Claim 흐름

`local_trusted`에서 `authenticated`로 전환할 때, Baton은 시작 시 일회성 claim URL을 출력합니다:

```
/board-claim/<token>?code=<code>
```

로그인한 사용자가 이 URL에 접속하여 board 소유권을 획득합니다. 이 과정에서:

- 현재 사용자를 인스턴스 관리자로 승격합니다
- 자동 생성된 로컬 board 관리자를 강등합니다
- 획득하는 사용자의 활성 회사 멤버십을 보장합니다

## 모드 변경

배포 모드를 변경합니다:

```sh
pnpm baton configure --section server
```

환경 변수를 통한 런타임 재정의:

```sh
BATON_DEPLOYMENT_MODE=authenticated pnpm baton run
```
