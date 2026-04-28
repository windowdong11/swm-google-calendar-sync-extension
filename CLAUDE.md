# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 먼저 읽을 문서

이 CLAUDE.md는 진입용 요약이다. 실제 작업 전에 아래를 순서대로 읽는다.

1. `docs/agent-guide.md` — 페이지별 책임, 메시지 타입, 캘린더 매핑, 충돌 판정 등 변하지 않는 토대
2. `docs/specs/README.md` — 스펙 디렉토리 정책(브랜치 전략·템플릿·Phase 인덱스)
3. `docs/specs/NEXT-SESSION.md` — 사용자 결정 대기(`@user`)·차단 항목(`B-*`)·다음 작업 단위
4. `docs/agent-troubleshooting/README.md` — 실제 Calendar 검증 모드 vs 전체 목업 모드 구분과 SoMA 목업 범위

새 기능 작업이라면 위 1→2→3, 버그 분석이라면 1→4 순서가 빠르다.

## 명령어

```bash
npm test                                        # 전체 테스트 (node --test, jsdom 의존)
node --test tests/unit/parsers.test.js          # 단일 파일 실행
node --test --test-name-pattern="manifest"      # 이름으로 필터
node scripts/build-release.mjs --oauth-client-id='<CHROME_EXT_OAUTH_CLIENT_ID>'
node scripts/build-release.mjs --include-key --oauth-client-id='...'   # 스토어 재업로드용 (key 유지)
```

빌드 단계 없음(Manifest V3 확장을 unpacked 그대로 로드). `npm install`은 jsdom 한 개만 깐다.

## 아키텍처 핵심

**번들러 없음 / 모듈 시스템 없음**. content script는 `manifest.json`의 `js` 배열 순서대로 로드되고, 공유 함수는 전역(window) 또는 IIFE 패턴으로 노출한다. content script와 background는 `chrome.runtime.sendMessage()`로만 통신하므로 import 경로를 추가하지 말 것.

**페이지별 content script 분리**:
- 목록(`/sw/mypage/mentoLec/list.do`) → `parsers.js` + `lecture-status.js` + `content.js`
- 상세(`/sw/mypage/mentoLec/view.do`) → `parsers.js` + `lecture-status.js` + `apply.js`
- 접수내역(`/sw/mypage/userAnswer/history.do`) → `parsers.js` + `history.js`

`parsers.js`와 `lecture-status.js`는 페이지간 공통 모듈이다. 한 곳을 고치면 세 페이지 모두 영향. 테스트에서 검증한다.

**Background service worker(`src/background/service-worker.js`)가 단일 OAuth/Calendar 게이트웨이**:
- Google OAuth는 `chrome.identity.getAuthToken()`만 사용
- Calendar API 호출은 모두 service worker에서 수행, content script는 메시지 타입으로만 요청
- 메시지 타입은 `agent-guide.md` §7에 정의됨. 신규 메시지를 추가하면 그 문서도 동시에 갱신
- 특강↔캘린더 이벤트 연결은 `chrome.storage.local.lectureEventMappings` + Google 이벤트의 `extendedProperties.private.somaManaged`/`somaQustnrSn` 양쪽에 저장. 한쪽이 깨져도 다른 쪽으로 재연결하는 보완 로직이 있으니 임의로 한쪽만 변경 금지.

**SWM DOM에 강결합**: `.boardlist`, `.bbs-view-new .group`, `td` 인덱스, `javascript:delDate(...)`/`applyCancel(...)` 패턴. 사이트 변경에 깨지기 쉽다. DOM 셀렉터·시간 포맷 변경 시 목록·상세·접수내역 파서 셋을 함께 본다.

## 작업 규약

- **한 feature 브랜치 = 한 spec**. `feature/NN-<short-name>` 형식. spec은 `docs/specs/NN-*.md`에 있고 `Status: draft|in-progress|shipped`로 진행 추적.
- 커밋 메시지는 conventional commits (`feat:`/`fix:`/`test:`/`docs:`/`refactor:`/`chore:`). 기존 git log 스타일 참고.
- 새 기능 spec 없이 `src/` 코드 변경 금지(버그 픽스·리팩터 제외). spec이 없으면 먼저 `docs/specs/`에 추가하고 작업 흐름은 `docs/specs/README.md` §1 참조.
- 스펙 본문에 `@user`/`@tbd`가 남아 있으면 코딩 진입 전에 NEXT-SESSION.md로 결정 상태 확인.

## 실행 환경 / 검증

- **실제 Calendar 검증 모드**가 기준(`docs/agent-troubleshooting/runtime-env.md`). SoMA `/apply.json`/`/applyCancel.json`/`/cancel.json` 세 엔드포인트만 목업하고 Google Calendar는 실제 API로 확인.
- **전체 목업 모드**(`mock/mock-env.js`)는 DOM 파싱·UI 흐름 빠른 확인용. 캘린더 생성/삭제 최종 검증에는 사용하지 않는다.
- 테스트 fixture: `tests/fixtures/site-current/`(파서 회귀용 실제 사이트 캡처) vs `mock/`(브라우저 수동 확인용). 역할이 다르니 섞지 말 것.
- 비Chrome Chromium 브라우저(Arc/Brave/Edge)는 `chrome.identity.getAuthToken()`이 실패할 수 있다. 검증은 Chrome에서.

## 보안 / 비밀값

- `.agent/soma-login.local.json` 등 `.agent/*.local.json`은 SoMA 로그인 보조용 로컬 파일. **대화/로그/스크린샷/문서/fixture/배포 ZIP에 포함 금지**, 학습 데이터·프롬프트 예시 재사용 금지. `.gitignore`에 이미 등재됨.
- Google 비밀번호·OAuth refresh/access token을 파일에 저장하지 않는다. Chrome 프로필 세션을 사용.
- `manifest.json`의 `oauth2.client_id`는 Chrome Extension 타입이어야 하고, Google Cloud Console에 등록된 item ID가 현재 확장 ID와 일치해야 OAuth가 통과한다. 배포는 `scripts/build-release.mjs --oauth-client-id=...`로 주입.
