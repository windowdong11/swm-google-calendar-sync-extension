# SOMA Schedule Helper Agent Guide

이 문서는 에이전트가 SOMA Schedule Helper 확장프로그램을 수정하거나 분석할 때 빠르게 기능 범위와 구현 흐름을 파악하기 위한 작업용 문서이다.

## 1. 제품 목적

SOMA Schedule Helper는 소프트웨어 마에스트로(SWM/SoMA) 특강 페이지에서 특강 시간과 Google Calendar 일정을 비교하고, 신청한 특강을 캘린더 일정으로 동기화하는 Chrome 확장프로그램이다.

주요 목표는 다음과 같다.

- 특강 신청 전 개인 캘린더 일정과의 충돌을 확인한다.
- 신청한 특강을 Google Calendar에 생성하거나 최신 정보로 갱신한다.
- 취소되거나 삭제된 특강 일정을 Google Calendar에서도 정리한다.
- 접수내역을 신뢰 가능한 원천으로 보고 캘린더와 재동기화한다.

## 2. 실행 대상 페이지

확장프로그램은 `manifest.json`의 `content_scripts` 설정에 따라 아래 페이지에서만 동작한다.

- 특강 목록: `https://www.swmaestro.ai/sw/mypage/mentoLec/list.do*`
- 특강 상세/신청: `https://www.swmaestro.ai/sw/mypage/mentoLec/view.do*`
- 접수내역: `https://www.swmaestro.ai/sw/mypage/userAnswer/history.do*`

## 3. 주요 파일

- `manifest.json`: 확장 권한, content script 매핑, OAuth scope, 옵션 페이지 정의
- `src/background/service-worker.js`: 설정 로드/저장, OAuth 토큰 획득, Google Calendar API 호출, 특강-캘린더 이벤트 매핑 관리
- `src/content/content.js`: 특강 목록 페이지 UI, 목록 날짜 조회, 특강 파싱, 충돌 계산, 필터와 패널 렌더링
- `src/content/apply.js`: 특강 상세 페이지의 신청/취소 흐름 가로채기, 상세 페이지 충돌 표시, 신청/취소 후 캘린더 동기화
- `src/content/history.js`: 접수내역 페이지 전체 수집, 접수 완료/삭제 상태 기준 캘린더 재동기화, 접수 취소 핸들러
- `src/content/lecture-status.js`: 공통 시간 정규화, 충돌 판정, 접수내역 수집 헬퍼, 배지/패널 UI 생성
- `src/options/options.html`: 확장프로그램 설정 화면
- `src/options/options.js`: 설정 로드/저장 로직
- `src/calendar/calendar.html`: 확장 아이콘 클릭으로 열리는 캘린더 뷰 페이지 (SoMA DOM과 무관한 독립 페이지)
- `src/calendar/calendar.js`: 캘린더 페이지 부트스트랩 — storage·메시지 구독, 뷰 전환, 드래그 인터랙션
- `src/calendar/calendar-view.js`: 주간/월간 그리드 및 사이드 패널 렌더 함수 (DOM 직접 조작, chrome API 의존 없음)
- `src/calendar/lecture-filter.js`: `filterLecturesForPanel(lectures, dragRange, now)` 순수 함수
- `mock/calendar.html`: 더미 Google Calendar 이벤트 + lectureSnapshot 주입 수동 확인 fixture
- `mock/`, `example/`: SWM 페이지 구조를 흉내 낸 수동 확인용 fixture

## 4. 페이지별 기능

### 4.1 특강 목록 페이지

담당 파일: `src/content/content.js`

특강 목록 페이지에서는 다음 기능을 제공한다.

- 날짜 기준 목록 조회 바를 삽입한다.
- 시작일/종료일 입력, `-1일`, `+1일`, `오늘만`, `초기화`, `날짜 조회` 버튼을 제공한다.
- 날짜 범위가 없는 경우 기본값으로 오늘부터 이번 달 말일까지를 사용한다.
- SWM 기본 상태 필터나 폼 제출 시 현재 날짜 범위를 유지한다.
- 접수중 특강 행에서 특강 ID, 제목, 상세 URL, 시작/종료 시간을 파싱한다.
- Google Calendar 일정을 불러와 특강별 충돌 상태를 계산한다.
- 행마다 상태 배지를 추가한다.
- 배지를 클릭하면 겹치는 일정 또는 바로 앞 일정을 보여주는 패널을 토글한다.
- 목록 상단에 충돌 상태 요약 바를 표시한다.
- `전체 보기`, `겹침만`, `바로 이어짐만`, `겹치지 않음만`, `다시 계산` 필터 바를 제공한다.
- Google Calendar 연결 상태와 SoMA 로그인 상태를 안내하는 배너를 표시한다.
- 겹치는 캘린더 일정을 열거나, 설정에 따라 직접 삭제할 수 있다.
- 접수내역에서 확인 가능한 특강은 목록 패널에서 취소할 수 있다.

### 4.2 특강 상세/신청 페이지

담당 파일: `src/content/apply.js`

특강 상세 페이지에서는 다음 기능을 제공한다.

- 상세 화면에서 특강 ID(`qustnrSn`), 모집 명, 장소, 강의날짜, 모집인원, 현재 신청 수를 파싱한다.
- 모집 명 영역 옆에 Google Calendar 기준 충돌 상태 배지를 표시한다.
- 충돌 또는 바로 이어짐 상태인 경우 상세 패널을 표시한다.
- 신청 버튼 클릭을 가로채 SoMA 신청 API를 호출한다.
- 신청 성공 또는 이미 신청된 상태에서는 Google Calendar 일정을 생성/갱신한다.
- 신청 후 캘린더 동기화 실패 시 접수내역 페이지에서 다시 동기화할 수 있도록 안내한다.
- 취소 버튼 클릭을 가로채 SoMA 취소 API를 호출한다.
- 특강 시작 24시간 이내인 경우 취소를 차단한다.
- 취소 성공 시 연결된 Google Calendar 일정을 삭제한다.

### 4.3 접수내역 페이지

담당 파일: `src/content/history.js`

접수내역 페이지에서는 다음 기능을 제공한다.

- 접수내역 동기화 배너를 삽입한다.
- 현재 페이지와 추가 페이지를 모두 순회해 접수내역 전체를 수집한다.
- `접수완료` 행을 활성 특강으로 간주한다.
- 삭제 상태 행은 비활성 특강으로 간주하고 캘린더 삭제 대상으로 처리한다.
- 상세 페이지 URL이 있으면 상세 페이지를 추가로 읽어 장소 정보를 보강한다.
- 수집된 활성 특강을 Google Calendar에 생성/갱신한다.
- 삭제된 특강 또는 더 이상 활성 목록에 없는 로컬 매핑을 Google Calendar에서 정리한다.
- 동기화 결과를 `생성`, `업데이트`, `유지`, `삭제`, `삭제행 처리`, `정리` 건수로 보여준다.
- `다시 동기화` 버튼을 제공한다.
- Google Calendar 연결이 필요한 경우 `Google 연결` 버튼을 제공한다.
- 접수 취소 링크를 가로채 취소 후 접수내역 기준으로 다시 동기화한다.

## 5. 충돌 판정

담당 파일: `src/content/lecture-status.js`

`classifyLecture()`는 특강과 캘린더 이벤트 목록을 비교해 다음 상태 중 하나를 반환한다.

- `OVERLAP`: 특강 시간이 하나 이상의 캘린더 일정과 겹친다.
- `BACK_TO_BACK_PREV`: 바로 앞 일정 종료 후 설정된 기준 분 이내에 특강이 시작한다.
- `CLEAR`: 겹치는 일정이 없고 바로 이어지는 일정도 없다.
- `UNKNOWN`: 특강 시작/종료 시간을 파싱하지 못했다.

충돌 계산 시 현재 특강과 이미 연결된 캘린더 이벤트는 무시할 수 있다. 이는 신청한 특강 자체가 다시 충돌로 표시되는 것을 막기 위한 처리이다.

## 6. Google Calendar 연동

담당 파일: `src/background/service-worker.js`

Google Calendar 연동은 `chrome.identity.getAuthToken()`과 Google Calendar API로 처리한다.

필요한 OAuth scope는 다음과 같다.

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events`

캘린더 이벤트 조회 시 기본적으로 `primary` 캘린더를 사용한다. `selectedCalendarIds` 설정은 배열 형태지만 현재 옵션 UI에서는 `primary`만 저장한다.

### 6.1 관리 대상 이벤트

확장프로그램이 생성한 특강 일정은 Google Calendar 이벤트의 `extendedProperties.private`에 다음 정보를 저장한다.

- `somaManaged`: `"1"`
- `somaQustnrSn`: 특강 ID
- `somaLectureTitle`: 특강 제목
- `somaPlace`: 장소
- `somaDetailUrl`: 상세 페이지 URL

이 메타데이터는 이후 일정 갱신, 재연결, 삭제 후보 탐색에 사용된다.

### 6.2 로컬 매핑

특강과 캘린더 이벤트의 연결 정보는 `chrome.storage.local`의 `lectureEventMappings` 키에 저장한다.

매핑에는 다음 정보가 포함된다.

- `calendarId`
- `eventId`
- `qustnrSn`
- `title`
- `place`
- `summary`
- `startAt`
- `endAt`
- `detailUrl`
- `syncedAt`

### 6.3 생성/갱신/삭제 규칙

- 신청 또는 접수내역 동기화 시 기존 매핑의 이벤트를 우선 조회한다.
- 매핑된 이벤트가 없으면 특강 ID, 시간, 제목, 위치, 설명을 기준으로 후보 이벤트를 검색한다.
- 후보가 있으면 기존 이벤트에 다시 연결한다.
- 후보가 없으면 새 Google Calendar 이벤트를 생성한다.
- 기존 이벤트 내용이 특강 정보와 다르면 PATCH로 갱신한다.
- 삭제 시 매핑된 이벤트 ID를 우선 삭제한다.
- 매핑된 이벤트가 없으면 시간과 제목 기반 후보 검색으로 삭제를 보완한다.

## 7. Content Script 메시지 타입

content script와 확장 자체 페이지(예: `src/calendar/calendar.html`)는 `chrome.runtime.sendMessage()`로 background service worker에 작업을 요청한다.

- `GET_SETTINGS`: 사용자 설정을 가져온다.
- `GET_LECTURE_MAPPINGS`: 특강 ID 목록에 해당하는 로컬 매핑을 가져온다.
- `AUTH_CONNECT_GOOGLE`: 대화형 Google OAuth 연결을 시작한다.
- `GET_CALENDAR_EVENTS`: 지정한 시간 범위(`{timeMin, timeMax}` ISO)의 Google Calendar 일정을 조회한다. content script와 calendar 페이지가 공통 사용.
- `DELETE_CALENDAR_EVENT`: 특정 캘린더 이벤트를 직접 삭제한다. `allowDirectDelete` 설정이 켜져 있어야 한다.
- `UPSERT_SOURCE_LECTURE`: 단일 특강을 Google Calendar에 생성 또는 갱신한다.
- `SYNC_SOURCE_LECTURES`: 접수내역 기준 특강 목록을 Google Calendar와 전체 동기화한다.
- `DELETE_CALENDAR_EVENT_BY_LECTURE`: 특강 정보와 매핑을 기준으로 연결된 Google Calendar 일정을 삭제한다.
- `POLLING_TRIGGER_NOW`: 백그라운드 폴링(spec 05)을 즉시 1회 실행한다. calendar 페이지의 "지금 갱신" 버튼이 사용.
- `POLLING_GET_STATE`: 폴링 상태(`lectureSnapshot`, `pollingState`)를 조회한다.
- `POLLING_UPDATE_SETTINGS`: 폴링 설정(주기·범위·활성)을 갱신한다.

## 8. 사용자 설정

기본 설정은 `service-worker.js`와 `options.js`에 정의되어 있다.

- `backToBackMinutes`: 바로 이어짐 판정 기준. 기본값은 `15`, 허용 범위는 `0~120`분이다.
- `allowDirectDelete`: 겹침 일정 패널에서 Google Calendar 이벤트 직접 삭제 버튼을 표시할지 결정한다. 기본값은 `false`이다.
- `confirmBeforeDelete`: 삭제 전 확인창을 표시할지 결정한다. 기본값은 `true`이다.
- `includeTransparentEvents`: Google Calendar의 transparent 일정을 충돌 비교에 포함할지 결정한다. 기본값은 `false`이다.
- `selectedCalendarIds`: 조회/동기화 대상 캘린더 ID 목록이다. 현재는 `["primary"]`로 고정된다.

## 9. 취소 제한

상세 페이지와 접수내역 페이지 모두 특강 시작 24시간 이내에는 취소를 차단한다.

이 제한은 다음 파일에 각각 구현되어 있다.

- `src/content/apply.js`: 상세 페이지 신청 취소 처리
- `src/content/history.js`: 접수내역 취소 처리
- `src/content/lecture-status.js`: 패널 내 취소 버튼 활성화 판단

## 10. 작업 시 주의사항

- SWM 페이지 DOM 구조에 강하게 의존한다. `.boardlist`, `.bbs-view-new .group`, `td` 인덱스, `javascript:delDate(...)`, `applyCancel(...)` 패턴 변경에 취약하다.
- 시간 파싱 실패 시 `UNKNOWN` 상태가 표시된다. 사이트 날짜 포맷이 바뀌면 목록, 상세, 접수내역 파서를 함께 확인해야 한다.
- Google Calendar의 `transparent` 일정은 기본적으로 충돌 비교에서 제외된다.
- 기존 매핑이 깨졌을 때도 후보 검색으로 이벤트를 재연결하거나 삭제하려는 보완 로직이 있다.
- `sourceComplete`가 `true`인 접수내역 동기화에서는 활성 목록에 없는 로컬 매핑이 정리된다.
- SoMA 신청/취소 API는 페이지 세션과 same-origin credentials에 의존한다.
- OAuth는 Chrome Extension 타입 client ID와 현재 확장프로그램 ID가 맞아야 동작한다.
- Arc, Brave, Edge 같은 비Chrome Chromium 브라우저에서는 `chrome.identity.getAuthToken()` 흐름이 실패할 수 있다.
- content script 변경 시 실제 SWM 페이지가 없으면 `mock/` 또는 `example/` HTML로 DOM 파싱과 UI 삽입을 먼저 확인한다.

## 11. 권장 확인 흐름

기능 변경 후에는 변경 범위에 따라 다음을 확인한다.

- 목록 UI 변경: `mock/list.html` 또는 실제 목록 페이지에서 날짜 조회 바, 배지, 필터, 패널 표시 확인
- 상세 신청 변경: `mock/view-apply.html`에서 신청 버튼 가로채기와 상세 상태 표시 확인
- 상세 취소 변경: `mock/view-cancel.html`에서 취소 버튼 가로채기 확인
- 접수내역 변경: `mock/history.html`에서 전체 동기화 배너와 취소 핸들러 확인
- 캘린더 연동 변경: `service-worker.js`의 메시지 타입, 매핑 저장, Google Calendar API 요청/응답 처리 확인
- 설정 변경: 옵션 페이지에서 저장 후 `chrome.storage.sync`에 반영되는지 확인
