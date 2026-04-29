# Spec 01: 캘린더 뷰 — Google Calendar 본체 + 사이드 패널 특강 탐색

> Status: in-progress
> Branch: feature/01-calendar-view
> Phase: 1
> Depends on: **05 (background-polling) — 선행 머지 필수**. 사이드 패널이 폴링 결과 `lectureSnapshot`을 데이터 소스로 소비한다. 캘린더 본체는 service-worker의 기존 `GET_CALENDAR_EVENTS` 메시지(Google Calendar API)를 사용한다.

> ⚠️ **선행 작업 안내**: 본 spec은 (a) `chrome.storage.local.lectureSnapshot`이 채워져 있고(spec 05 폴링 1회 이상 성공), (b) 사용자가 Google OAuth로 Calendar 권한을 부여한 상태를 가정한다. 둘 중 하나가 미충족이면 캘린더 본체 또는 사이드 패널이 빈 상태로 표시된다.

## 1. 목적

SoMA 신청 특강은 기존 OAuth 흐름으로 이미 Google Calendar에 삽입된다. 그러나 사용자가 "내 일정 사이의 빈 시간대에 어떤 미신청 특강이 들어맞을까"를 탐색하려면 SWM 목록 페이지에서 표를 위아래로 훑어야 한다. **확장 아이콘 클릭으로 열리는 별도 탭(`calendar.html`)에서 내 Google Calendar 일정을 시간축 그리드로 보여주고, 빈 시간대를 드래그하면 그 범위에 완전히 들어맞는 SoMA 미신청 특강을 사이드 패널에 노출**해 탐색·신청 진입을 돕는다.

## 2. 사용자 스토리

- as a 연수생, I want 브라우저 어디에서나 확장 아이콘 한 번으로 내 Google Calendar 일정을 시간축으로 보고, so that "이번 주에 무엇을 하기로 했는지" 한눈에 확인한다.
- as a 연수생, I want 빈 시간대를 마우스로 드래그하면 그 시간에 완전히 맞는 미신청 SoMA 특강만 사이드 패널에 보고, so that "내 빈 1시간에 들어갈 수 있는 특강이 뭔지"를 캘린더 컨텍스트에서 바로 본다.
- as a 연수생, I want 사이드 패널 카드를 클릭해 SoMA 상세 페이지로 이동하고, so that 캘린더 컨텍스트에서 신청 흐름으로 자연스럽게 진입한다.

## 3. 범위

### 포함
- **확장 아이콘 클릭 → 새 탭으로 `calendar.html` 열기** (이미 열려 있으면 그 탭 활성화)
- 월간 그리드(7일 × 5~6주)와 주간 그리드(7일 × 시간대) 두 모드. 주간 시간축은 **08:00~24:00 고정**.
- **캘린더 본체 = Google Calendar 이벤트만** 시간 위치·길이에 맞춰 블록으로 렌더. SoMA 신청 특강은 OAuth가 이미 Calendar에 삽입했으므로 본체에 자연 포함되며, `extendedProperties.private.somaManaged === "1"`로 시각 구분.
- **빈 영역 드래그 인터랙션**: mousedown → mousemove → mouseup으로 시간 범위 선택. 선택 영역은 반투명 오버레이로 표시. ESC 또는 다른 영역 클릭으로 해제.
- **사이드 패널 = lectureSnapshot 기반 특강 목록**:
  - 기본 필터: **이미 끝난 특강 제외** (`endAt < now`)
  - 드래그 활성 시 추가 필터: **드래그 범위에 특강이 완전 포함** (`drag.start ≤ lecture.startAt AND lecture.endAt ≤ drag.end`)
  - 향후 확장 슬롯: spec 02(카테고리)·03(멘토)·04(필터)에서 추가될 필터 함수를 plug-in 가능한 배열로 노출(현 PR에선 슬롯만 마련, 실제 필터는 비활성)
- 사이드 패널 카드 클릭 → SoMA 상세 페이지(`detailUrl`) 새 탭 열기
- 월/주 그리드 토글, 이전/다음 기간 이동
- "지금 갱신" 버튼 → spec 05 `POLLING_TRIGGER_NOW` 호출 + Google Calendar 재fetch
- 빈 상태 / 인증 만료(`pausedReason="auth-expired"`) / Google Calendar fetch 실패 시 안내 화면

### 제외 (다음 phase로)
- 일간 뷰, 사용자 색상 커스터마이즈
- 사이드 패널에서 직접 신청·취소 (SoMA 상세 진입까지만)
- 다중 캘린더 비교 뷰
- 캘린더 페이지 안의 알림 표시(=spec 08)
- 캘린더 본체에 SoMA 미신청 특강을 직접 렌더 (의도적으로 사이드 패널 책임으로 분리)
- spec 02·03·04 필터 UI 자체 (슬롯 인터페이스만 마련)

## 4. 동작 시나리오

### Golden path
1. 사용자가 브라우저 툴바의 확장 아이콘을 클릭한다.
2. service worker가 새 탭으로 `chrome-extension://<id>/src/calendar/calendar.html`을 연다(또는 이미 열린 탭이 있으면 활성화).
3. `calendar.js` 부트스트랩이 (a) `GET_CALENDAR_EVENTS` 메시지로 현재 viewMode·anchorDate에 해당하는 시간 범위의 Google Calendar 이벤트를 받아오고, (b) `chrome.storage.local.lectureSnapshot`에서 lecture 배열을 읽는다.
4. `calendar-view.js`가 그리드 본체에 Google Calendar 이벤트를 렌더, 사이드 패널에 lectureSnapshot의 끝나지 않은 특강을 시간순으로 렌더한다.
5. 기본 모드는 `week`. 상단 토글로 `월` 전환 가능. 모드는 `chrome.storage.local.calendarViewMode`에 저장.
6. 사용자가 빈 영역에 mousedown → drag → mouseup. `dragRange = {start, end}`(메모리)로 설정. 사이드 패널이 즉시 필터링되어 "drag 범위에 완전 포함되는 끝나지 않은 lecture"만 표시.
7. 사이드 패널 카드 클릭 시 새 탭으로 SoMA 상세 페이지(`lecture.detailUrl` 또는 `lecture.url`)를 연다.
8. 상단 `이전` / `다음` 버튼으로 그리드 기준 월·주를 이동. 이동 결과는 `calendarAnchorDate`에 저장 + 새 시간 범위로 Google Calendar 재fetch.
9. 상단에 `마지막 갱신: HH:mm` 표시. `지금 갱신` 버튼은 `POLLING_TRIGGER_NOW` + `GET_CALENDAR_EVENTS` 둘 다 호출.

### 엣지 케이스
- `lectureSnapshot`이 비어 있음(폴링 미활성·1회도 미성공): 사이드 패널에 "백그라운드 폴링이 아직 실행되지 않았습니다. `옵션 열기` 또는 `지금 갱신`을 눌러주세요." 안내. 캘린더 본체는 Google Calendar 이벤트가 있으면 정상 표시.
- 폴링이 인증 만료로 정지(`pausedReason="auth-expired"`): 사이드 패널에 "SoMA 로그인이 만료되었습니다. SoMA 페이지에서 다시 로그인 후 `지금 갱신` 눌러주세요." 안내.
- Google Calendar fetch 실패(OAuth 미인증·네트워크): 캘린더 본체에 "Google Calendar에 접근할 수 없습니다. 확장 옵션에서 권한을 확인하세요." 안내. 사이드 패널은 정상 동작.
- 빈 lectureSnapshot + 끝난 특강만 있음: 사이드 패널에 "현재 신청 가능한 특강이 없습니다." 안내.
- 드래그 영역에 완전 포함되는 lecture 0건: 사이드 패널에 "이 시간대에 들어맞는 미신청 특강이 없습니다." 안내.
- 드래그 영역이 시간축 외(예: 02:00~05:00): UI에서 드래그 영역을 시간축 내(08:00~24:00)로 clamp. clamp 후에도 빈 lecture면 위 안내.
- Google Calendar 이벤트가 자정을 넘는 경우(`endAt`이 다음 날): 시작일 셀과 다음 날 셀 두 곳에 분할 렌더(연속선 표시).
- SoMA 신청 특강(`extendedProperties.private.somaManaged === "1"`)은 일반 일정과 시각 구분(테두리·배경 톤).
- 한국 표준시(Asia/Seoul) 기준으로 그룹화. lectureSnapshot의 `startAt`은 Seoul ISO, Google Calendar 이벤트는 RFC3339(UTC offset 포함)이라 양쪽 모두 KST로 변환 후 비교.

## 5. UI 변경

- **페이지: 신규 — `src/calendar/calendar.html`** (확장 자체 페이지, SoMA DOM과 무관)
- **확장 아이콘 동작**: `manifest.json`의 `action`에 `default_title` 설정. `default_popup`은 두지 않고, service worker의 `chrome.action.onClicked` 핸들러에서 `chrome.tabs.create({ url: "src/calendar/calendar.html" })`. 이미 열린 탭은 `chrome.tabs.query`로 찾아 `chrome.tabs.update({ active: true })`.
- 페이지 레이아웃 (좌 70% : 우 30%):
  - **상단 헤더**: `월 / 주` 토글, 이전·다음 버튼, 기간 라벨, `마지막 갱신: HH:mm`, `지금 갱신` 버튼, `옵션 열기` 링크
  - **좌측 본문**: CSS Grid 기반 캘린더 그리드. Google Calendar 이벤트만 블록 렌더. SoMA 신청 특강(`somaManaged`)은 테두리 색·배경 톤 다르게.
  - **우측 사이드 패널**:
    - 상단: 현재 선택된 드래그 시간 범위 표시 + `해제` 버튼 (드래그 X 시 "전체 미신청 특강")
    - 본문: 필터된 lectureSnapshot 카드 리스트(시간·제목·잔여석 등). 시간순 정렬.
    - 빈 결과: "이 시간대에 들어맞는 미신청 특강이 없습니다." (또는 빈 상태에 따라 다른 안내)
  - **하단**: (주간 모드에서만) `시간 범위 밖 N건` 요약 — 클릭 시 일자 팝오버
- **드래그 인터랙션**: 빈 영역 mousedown → mousemove로 종료 시각 업데이트(반투명 오버레이) → mouseup으로 확정. ESC 또는 캘린더 외 영역 클릭으로 해제. 카드/이벤트 블록 위 mousedown은 카드 클릭으로 처리(드래그 시작 안 함).
- 스타일: `src/calendar/calendar.css`. 다크 모드는 phase 1 범위 외(시스템 폰트만 적용).
- mock fixture: `mock/calendar.html`을 추가해 더미 Google Calendar 이벤트 + 더미 lectureSnapshot으로 그리드·드래그·사이드 패널 검증.

## 6. 데이터 모델

본 spec이 신규 도입하는 storage:

```ts
// chrome.storage.local
type CalendarViewState = {
  calendarViewMode: "month" | "week"; // 기본 "week"
  calendarAnchorDate?: string;        // ISO date, 캘린더가 보고 있는 월·주 기준
};
```

본 spec이 메모리에서만 관리(지속화 X):

```ts
type DragRange = { start: string; end: string } | null;  // ISO datetime, 페이지 reload 시 초기화
```

본 spec이 **읽기만** 하는 storage(spec 05 소유):

```ts
type LectureSnapshot = {
  takenAt: string;
  rangeStart: string;
  rangeEnd: string;
  lectures: Lecture[];
};

type Lecture = {
  id: string;          // qustnrSn
  title: string;
  startAt: string;     // Seoul ISO datetime
  endAt: string;
  url: string;         // detailUrl
  statusText?: string;
  rawText?: string;
  parseFailed?: boolean;
};

type PollingState = {
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  consecutiveFailures: number;
  pausedReason: "auth-expired" | "structure-changed" | "max-retry" | null;
};
```

본 spec이 service-worker를 통해 fetch하는 외부 데이터:

```ts
// GET_CALENDAR_EVENTS 메시지의 응답 (service-worker가 Google Calendar API에서 fetch)
type CalendarEvent = {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  extendedProperties?: { private?: { somaManaged?: "1"; somaQustnrSn?: string } };
};
```

## 7. 의존성

- **읽기**:
  - `chrome.storage.local.lectureSnapshot` (spec 05 소유) — 사이드 패널 데이터 소스
  - `chrome.storage.local.pollingState` (spec 05 소유) — auth-expired 안내
  - `chrome.storage.local.calendarViewMode`, `calendarAnchorDate` (본 spec 소유)
  - Google Calendar API (service-worker `GET_CALENDAR_EVENTS` 메시지 통한 간접 호출)
- **쓰기**: `calendarViewMode`, `calendarAnchorDate`
- **호출**:
  - `chrome.action.onClicked` (service worker에 핸들러 추가)
  - `chrome.tabs.create` / `chrome.tabs.update` / `chrome.tabs.query`
  - `chrome.runtime.sendMessage({ type: "GET_CALENDAR_EVENTS", payload: { timeMin, timeMax } })` (service-worker.js:840 기존 핸들러 재사용)
  - `chrome.runtime.sendMessage({ type: "POLLING_TRIGGER_NOW" })` (spec 05의 메시지 재사용)
  - `chrome.storage.onChanged`로 `lectureSnapshot` 변경 감지 → 사이드 패널 자동 재렌더

## 8. 변경 / 신규 파일

- 신규:
  - `src/calendar/calendar.html`
  - `src/calendar/calendar.css`
  - `src/calendar/calendar.js` (페이지 부트스트랩, storage·메시지 구독, 이벤트 바인딩)
  - `src/calendar/calendar-view.js` (그리드·사이드 패널 렌더 순수 함수)
  - `src/calendar/lecture-filter.js` (`filterLecturesForPanel(lectures, dragRange, now)` 순수 함수, 테스트 단위)
  - `tests/unit/calendar-view.test.js`
  - `tests/unit/lecture-filter.test.js`
  - `mock/calendar.html` (더미 events + 더미 lectureSnapshot 주입한 수동 확인 fixture)
- 수정:
  - `manifest.json`: `action` 블록에 `default_title` 추가, `default_popup` 키가 있으면 제거(`onClicked` fire 조건). `web_accessible_resources` 검토 후 필요시 calendar 자원 추가.
  - `src/background/service-worker.js`: `chrome.action.onClicked.addListener` 추가 (이미 열린 calendar 탭 활성화 또는 새 탭 생성).
  - `docs/agent-guide.md`: §3 페이지별 책임 표에 calendar 페이지 추가.

## 9. 메시지 프로토콜

신규 메시지 없음. 기존 재사용:
- `GET_CALENDAR_EVENTS` (service-worker.js:840) — payload `{ timeMin, timeMax }` ISO. response `{ ok, events }`.
- `POLLING_TRIGGER_NOW` (spec 05) — payload 없음. response `{ ok, snapshot? }`.
- `POLLING_GET_STATE` (spec 05) — payload 없음. response `{ ok, snapshot, state }`.

## 10. 테스트 케이스

- **unit (`tests/unit/lecture-filter.test.js`)**:
  - 드래그 X · `now` 기준 끝나지 않은 항목만 반환
  - 드래그 O · 완전 포함 케이스 (`drag.start === lecture.startAt` 경계 포함)
  - 드래그 O · 부분 겹침은 제외(드래그 시작 < lecture 시작 < 드래그 끝 < lecture 끝 같은 케이스)
  - 빈 lectureSnapshot · 빈 결과
  - `now`를 인자로 받게 설계해 시계 mock 없이 deterministic
- **unit (`tests/unit/calendar-view.test.js`)**:
  - 한 주 events 분배, 자정 넘는 event 분할 렌더, 시간축 외 event 하단 요약
  - Seoul TZ ↔ UTC 경계 처리 (Google Calendar dateTime의 timezone 변환)
  - SoMA 신청 특강(`extendedProperties.private.somaManaged === "1"`) 시각 구분 클래스 부여 검증
  - 빈 상태 + auth-expired 상태 안내 렌더
- **DOM (`mock/calendar.html`)**:
  - 더미 events + 더미 lectureSnapshot 주입 후 페이지 로드, 빈 영역 드래그 → 사이드 패널에 완전 포함 lecture만 보이는지
- **수동 (실 환경)**:
  1. 확장 아이콘 클릭 → 새 탭 / 두 번째 클릭 시 같은 탭 활성화
  2. Google Calendar 이벤트가 시간축에 정확히 표시
  3. 빈 영역 드래그 → 사이드 패널 활성 → 완전 포함 lecture만 표시
  4. 카드 클릭 → SoMA 상세 새 탭
  5. "지금 갱신" → spec 05 trigger + Google Calendar 재fetch 후 갱신

## 11. 비기능 요구사항

- 추가 권한 없음(spec 05가 이미 `alarms`, `host_permissions` 추가; OAuth는 기존).
- 성능: 1주 events 100개 + lectureSnapshot 100건 가정. 렌더 1회 100ms 이하. DOM 조작은 한 번에 fragment로 묶어서.
- 접근성: 셀에 `aria-label="YYYY-MM-DD"`. 카드는 키보드 포커스 가능. 드래그 인터랙션은 마우스 전용(키보드는 향후 phase에서 보강).
- 주간 뷰 시간축: **08:00~24:00 고정**. 범위 밖 events는 "+N건 (시간 범위 밖)" 요약으로 노출.
- 캘린더 페이지 자체는 외부 fetch를 하지 않는다. 모든 데이터는 `chrome.storage.local` 또는 service-worker 메시지 응답에서.
- `chrome.action.default_popup` 부재 필수 (`onClicked` fire 조건).

## 12. 미해결 질문

- ✅ U-01-1·U-01-2·D-3·T-01 모두 본 결정으로 해소 (2026-04-29 묶음 D 사용자 확정).
- `@tbd` Google Calendar fetch 실패 시 fallback — 단순 안내(현 spec) vs 자동 재시도. 코딩 시점 결정.
- `@tbd` 드래그 영역이 시간축 외(예: 02:00~05:00)일 때 처리 — UI에서 드래그 영역을 시간축 내(08:00~24:00)로 clamp 권장. 코딩 시점 결정.
- `@tbd` `calendarAnchorDate`가 `lectureSnapshot.rangeStart/rangeEnd` 범위를 벗어났을 때 사이드 패널 동작 — 빈 결과만 보일지, 폴링에 범위 확장 요청을 보낼지. 후자라면 spec 05에 `POLLING_TRIGGER_NOW` payload(범위)를 추가해야 함.

## 13. 관련 링크

- 코드:
  - `src/background/service-worker.js:840` (`GET_CALENDAR_EVENTS` 핸들러, 본 spec이 그대로 재사용)
  - `src/background/polling.js:137` (lectureSnapshot 저장, 본 spec이 구독)
  - `src/content/lecture-status.js:82` (`classifyLecture` — 사이드 패널 카드에 "내 일정과 겹침" 배지 부여 시 활용 가능)
- 관련 spec: **05 background-polling (선행)**, 02 카테고리·03 멘토·04 필터링(본 spec의 사이드 패널 필터 슬롯에 plug-in 예정)
