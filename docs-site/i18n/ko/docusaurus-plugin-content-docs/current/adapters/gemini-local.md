---
title: Gemini Local
description: Gemini CLI 로컬 어댑터 설정 및 구성
---

`gemini_local` 어댑터는 Gemini CLI를 로컬에서 실행합니다. 재개 가능한 세션, Baton 스킬 주입, 지시문 번들 연동, 보조 프로젝트 컨텍스트 주입을 지원합니다.

## 사전 요구 사항

- Gemini CLI 설치 (`gemini` 명령 사용 가능)
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, 또는 정상 동작하는 Gemini CLI 로컬 로그인

## 설정 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `cwd` | string | Yes | 에이전트 프로세스의 작업 디렉터리 (절대 경로; 권한이 허용되면 없을 경우 자동 생성) |
| `model` | string | No | Gemini 모델 ID (`auto` 기본값) |
| `instructionsFilePath` | string | No | Baton이 실행 프롬프트 앞에 붙이는 번들 진입 파일의 절대 경로 |
| `promptTemplate` | string | No | 사용자 태스크용 프롬프트 템플릿 |
| `sandbox` | boolean | No | sandbox 모드 토글 |
| `command` | string | No | CLI 실행 파일 이름 (`gemini` 기본값) |
| `extraArgs` | string[] | No | 추가 CLI 플래그 |
| `env` | object | No | 환경 변수 (시크릿 참조 지원) |
| `timeoutSec` | number | No | 실행 타임아웃(초) |
| `graceSec` | number | No | 강제 종료 전 유예 시간 |

## 세션 지속성

Gemini local은 저장된 세션이 현재 작업 디렉터리와 여전히 일치하면 하트비트 사이에서 세션을 재개합니다.

## 스킬 주입

Baton은 Gemini skills 디렉터리에 스킬을 주입하여 프로젝트 checkout을 수정하지 않고도 Baton 전용 스킬을 CLI가 발견할 수 있게 합니다.

## Instructions 와 프로젝트 컨텍스트

Gemini local은 다음 둘 다 받을 수 있습니다:

- 에이전트 지시문 번들 진입 파일
- 배경 설명, 규칙, 압축 컨텍스트, 거버넌스 알림에서 생성된 조합 프로젝트 지시문

## 환경 테스트

UI의 환경 테스트로 다음을 확인할 수 있습니다:

- Gemini CLI 설치 여부
- 작업 디렉터리 유효성
- 인증 가능 여부
- CLI가 간단한 live probe를 실제로 실행할 수 있는지
