# 실행 환경

실제 Calendar 검증 모드가 이 스펙의 기준 실행 환경이다.

## 실제 Calendar 검증 모드

- 실제 확장 파일, content script, background service worker를 사용한다.
- SoMA 신청/취소 서버 요청만 목업한다.
- Google Calendar 조회, 생성, 갱신, 삭제는 실제 `chrome.identity.getAuthToken()` 및 Google Calendar API로 수행한다.
- 기존 `mock/` fixture는 DOM 구조와 UI 흐름 확인에 사용할 수 있지만, Calendar 생성/삭제 최종 검증에는 사용하지 않는다.
- 테스트 Calendar 또는 테스트 Chrome 프로필 사용을 권장한다.

## 전체 목업 모드

기존 `mock/mock-env.js`는 전체 목업 모드에서 계속 사용할 수 있다.

- SoMA 페이지, 신청/취소, Calendar 메시지를 브라우저 내부에서 목업한다.
- UI 삽입, DOM 파싱, 버튼 흐름을 빠르게 확인하는 용도로 사용한다.
- 실제 Calendar 검증 모드에서는 Calendar 메시지를 브라우저 내부 목업으로 처리하지 않아야 한다.

## 주의사항 — SoMA URL 쿼리스트링

- `GET /sw/mypage/mentoLec/list.do`는 반드시 `?menuNo=200046` 쿼리스트링을 포함해야 한다. 누락 시 page-not-found 페이지로 리다이렉트되어 특강 목록이 비어진다. (spec 05 폴링, 2026-04-30 확정)
- 폴링 시에는 `pageIndex` 순회 + `scdate`/`ecdate` 사용을 권장하여 전체 강의 목록을 수집한다. (B-10 페이지네이션, 2026-04-30 확정)

## SoMA 목업 범위

SoMA 목업 범위는 아래 엔드포인트로 제한한다.

- `POST /sw/mypage/mentoLec/apply.json`
- `POST /sw/mypage/mentoLec/applyCancel.json`
- `POST /sw/mypage/userAnswer/cancel.json`

Google Calendar 관련 확장 메시지는 목업하지 않는다.

- `GET_CALENDAR_EVENTS`
- `UPSERT_SOURCE_LECTURE`
- `SYNC_SOURCE_LECTURES`
- `DELETE_CALENDAR_EVENT_BY_LECTURE`
- `DELETE_CALENDAR_EVENT`

## 로그인과 보안 제약

SoMA 로그인 정보는 로컬 파일로 관리한다.

- 권장 파일명: `.agent/soma-login.local.json`
- 저장 항목은 자동 로그인 또는 세션 준비에 필요한 최소 값으로 제한한다.
- 로그인 파일은 대화, 로그, 스크린샷, 문서, fixture, GitHub, 배포 ZIP에 포함하지 않는다.
- 로그인 파일 값은 예제 데이터나 테스트 fixture로 재사용하지 않는다.
- 로그인 파일 값은 에이전트 학습 데이터나 프롬프트 예시로 사용하지 않는다.
- `.gitignore`는 `.agent/soma-login.local.json` 및 `.agent/*.local.json`을 제외해야 한다.

Google 로그인은 파일로 관리하지 않는다.

- Chrome 사용자 프로필의 로그인 세션을 사용한다.
- Google 비밀번호, OAuth refresh token, access token을 파일에 저장하지 않는다.
- Calendar 권한은 확장의 `chrome.identity.getAuthToken()` 흐름으로 획득한다.

보안 항목은 환경 제약으로 관리하며 기능 Test Plan에는 포함하지 않는다.

## 관찰 지점

Calendar 생성/삭제 여부는 아래 지점으로 확인한다.

- Google Calendar UI 또는 Google Calendar API 응답
- 특강-캘린더 연결 정보: `chrome.storage.local.lectureEventMappings`
- Google Calendar 이벤트의 `extendedProperties.private.somaManaged`
- background service worker console output
- content script console output
