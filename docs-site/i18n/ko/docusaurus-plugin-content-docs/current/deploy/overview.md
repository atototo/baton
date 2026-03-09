---
title: 배포 개요
description: 배포 모드 한눈에 보기
---

Baton은 로컬 환경에서의 간편한 사용부터 인터넷에 노출되는 프로덕션 환경까지 세 가지 배포 설정을 지원합니다.

## 배포 모드

| 모드 | 인증 | 적합한 용도 |
|------|------|----------|
| `local_trusted` | 로그인 불필요 | 단일 운영자 로컬 머신 |
| `authenticated` + `private` | 로그인 필요 | 프라이빗 네트워크 (Tailscale, VPN, LAN) |
| `authenticated` + `public` | 로그인 필요 | 인터넷에 노출되는 클라우드 배포 |

## 빠른 비교

### Local Trusted (기본값)

- 루프백 전용 호스트 바인딩 (localhost)
- 사용자 로그인 절차 없음
- 가장 빠른 로컬 시작
- 적합한 용도: 단독 개발 및 실험

### Authenticated + Private

- Better Auth를 통한 로그인 필요
- 네트워크 접근을 위해 모든 인터페이스에 바인딩
- 자동 base URL 모드 (낮은 진입 장벽)
- 적합한 용도: Tailscale 또는 로컬 네트워크를 통한 팀 접근

### Authenticated + Public

- 로그인 필요
- 명시적 공개 URL 필요
- 더 엄격한 보안 검사
- 적합한 용도: 클라우드 호스팅, 인터넷에 노출되는 배포

## 모드 선택하기

- **Baton을 처음 사용해 보시나요?** `local_trusted` (기본값)를 사용하십시오
- **프라이빗 네트워크에서 팀과 공유하시나요?** `authenticated` + `private`를 사용하십시오
- **클라우드에 배포하시나요?** `authenticated` + `public`를 사용하십시오

온보딩 중에 모드를 설정합니다:

```sh
pnpm baton onboard
```

또는 나중에 변경할 수 있습니다:

```sh
pnpm baton configure --section server
```
