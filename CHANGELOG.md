# Changelog / 변경 이력

All notable changes to this project will be documented in this file.
이 프로젝트의 주요 변경사항을 기록합니다.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-03-19

### Added / 추가
- Default governed execution workflow with `approve_issue_plan`, ticket-scoped worktree provisioning, review handoff, and `approve_pull_request`
  - `approve_issue_plan`, 티켓 단위 워크트리 생성, 리뷰 핸드오프, `approve_pull_request`를 포함한 기본 governed 실행 워크플로우 추가
- Real pull request creation after PR approval, including commit, push, and GitHub PR creation
  - PR 승인 이후 실제 commit, push, GitHub PR 생성 흐름 추가
- Structured child delegation metadata for active-child dedupe during retries and resumes
  - 재시도/재개 시 활성 child 이슈를 안정적으로 재사용하기 위한 구조화된 delegation 메타데이터 추가
- Parallel ticket execution support using ticket-scoped execution workspaces
  - 티켓 단위 execution workspace를 사용하는 병렬 티켓 실행 지원 추가
- Workflow documentation for board operators and agent developers in product docs and docs-site
  - 보드 운영자 및 에이전트 개발자용 워크플로우 문서를 내부 문서와 docs-site에 추가

### Changed / 변경
- Parent issues now stay in `in_review` until PR approval succeeds and only transition to `done` after real PR creation completes
  - 부모 이슈는 PR 승인이 완료될 때까지 `in_review`를 유지하고, 실제 PR 생성이 끝난 뒤에만 `done`으로 전이되도록 변경
- Child issue dedupe now prefers structured delegation keys over title-only matching
  - child 이슈 중복 방지는 제목 문자열보다 구조화된 delegation key를 우선 사용하도록 변경
- Guide docs now describe leader fallback workspaces, ticket-scoped execution worktrees, reviewer defaults, and project workflow expectations
  - 가이드 문서에 리더 fallback 워크스페이스, 티켓 단위 실행 워크트리, 기본 리뷰어 동작, 프로젝트 워크플로우 기대 동작을 반영

### Fixed / 수정
- Fixed source-repo contamination by ensuring implementation work runs only inside Baton-managed execution worktrees
  - 구현 작업이 Baton-managed execution worktree 안에서만 실행되도록 보장해 source repo 오염 문제 수정
- Fixed orphan approvals and duplicate child issue creation during resumed or parallel parent flows
  - 재개/병렬 parent 흐름에서 orphan approval 및 중복 child 생성 문제 수정
- Fixed branch and execution context contamination across parallel tickets
  - 병렬 티켓 간 branch 및 실행 컨텍스트 오염 문제 수정
- Fixed premature parent completion before `approve_pull_request` approval
  - `approve_pull_request` 승인 전에 부모 이슈가 먼저 완료되던 문제 수정
- Added retry handling for transient Claude `529 overloaded_error` and transient local spawn failures such as `EBADF`
  - 일시적인 Claude `529 overloaded_error` 및 `EBADF` 같은 로컬 spawn 실패에 대한 재시도 처리 추가

## [0.3.0] - 2026-03-13

### Added / 추가
- Automatic approval request creation when agents hand off issues back to the board in `in_review`
  - 에이전트가 이슈를 `in_review` 상태로 board에 다시 넘길 때 승인 요청이 자동 생성되도록 추가
- New approval types for issue plan approval and pull request approval
  - 이슈 계획 승인과 PR 승인을 위한 신규 승인 타입 추가

### Changed / 변경
- Approval cards and issue detail views now render labels/payloads for issue plan and pull request approvals
  - 승인 카드와 이슈 상세에서 이슈 계획 승인 및 PR 승인 라벨/페이로드를 표시하도록 변경
- Issue execution guards now block implementation while plan approval is pending and pause implementation while PR approval is pending
  - 계획 승인 대기 중에는 구현이 차단되고, PR 승인 대기 중에는 구현 재개가 제한되도록 이슈 실행 가드 강화

### Fixed / 수정
- Adapter type changes in agent settings no longer wipe shared prompt/instructions fields such as prompt template, bootstrap prompt, working directory, and instructions path
  - 에이전트 설정에서 어댑터 유형을 바꿀 때 프롬프트 템플릿, 부트스트랩 프롬프트, 작업 디렉터리, instruction 경로 등 공통 필드가 초기화되던 문제 수정

## [0.2.0] - 2026-03-12

### Added / 추가
- Project settings tab with full property editing (status, lead agent, goals, target date)
  - 프로젝트 설정 탭에서 상태, 리드 에이전트, 목표, 목표일 편집 기능 추가
- Explicit save/discard workflow — changes require clicking "Save" button
  - 명시적 저장/취소 워크플로우 — 저장 버튼을 눌러야 반영
- Target date picker with calendar input and clear button
  - 달력 입력과 초기화 버튼이 있는 목표일 선택기
- Workspace section with visual separation between local folders and repositories
  - 로컬 폴더와 저장소를 구분하여 표시하는 워크스페이스 섹션
- `@` mention popup restored for textarea-based editors (new issue, comments)
  - 이슈 생성 및 코멘트 작성 시 `@` 멘션 팝업 복원

### Changed / 변경
- Project settings page redesigned with max-width constraint and card-based layout
  - 프로젝트 설정 페이지를 최대 너비 제한 및 카드 기반 레이아웃으로 리디자인
- `muted-foreground` color tokens improved for readability in both light and dark modes
  - `muted-foreground` 색상 토큰 개선으로 라이트/다크 모드 가독성 향상
  - Light: `#a1a1aa` → `#71717a` (WCAG AA 충족, 대비비 4.6:1)
  - Dark: `#52525b` → `#a1a1aa` (대비비 2.3:1 → 7.2:1)
- InlineHelp and guide colors switched from hardcoded blue to theme-aware tokens
  - InlineHelp 및 가이드 색상을 하드코딩된 파란색에서 테마 토큰으로 전환
- Properties panel now visible on settings tab (previously hidden)
  - 설정 탭에서 속성 패널이 보이도록 변경 (기존에는 숨김 처리)

### Fixed / 수정
- Mention detection not working in textarea mode (new issue dialog, comment composer)
  - textarea 모드에서 멘션 감지가 동작하지 않던 문제 수정
- Project settings editing missing after UI redesign — was read-only with no controls
  - UI 개편 후 프로젝트 설정 편집 기능이 누락된 문제 수정

## [0.1.0] - 2026-03-12

### Added / 추가
- Initial tagged release of Baton control plane UI
  - Baton 컨트롤 플레인 UI 최초 태그 릴리스
- Multi-agent management with hierarchical agent tree
  - 계층형 에이전트 트리를 포함한 멀티 에이전트 관리
- Project and issue tracking with kanban and list views
  - 칸반 및 리스트 뷰 기반의 프로젝트/이슈 관리
- Real-time activity feed and heartbeat monitoring
  - 실시간 활동 피드 및 하트비트 모니터링
- Onboarding flow for company and agent setup
  - 회사 및 에이전트 설정 온보딩 플로우
- Markdown editor with WYSIWYG and preview modes
  - WYSIWYG 및 미리보기 모드를 갖춘 마크다운 에디터
- i18n support (Korean, English)
  - 다국어 지원 (한국어, 영어)
- Dark/light theme with indigo design system
  - 인디고 디자인 시스템 기반 다크/라이트 테마

[Unreleased]: https://github.com/atototo/baton/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/atototo/baton/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/atototo/baton/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/atototo/baton/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/atototo/baton/releases/tag/v0.1.0
