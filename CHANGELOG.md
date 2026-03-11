# Changelog / 변경 이력

All notable changes to this project will be documented in this file.
이 프로젝트의 주요 변경사항을 기록합니다.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/atototo/baton/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/atototo/baton/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/atototo/baton/releases/tag/v0.1.0
