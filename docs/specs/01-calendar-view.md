# Spec 01: 캘린더 뷰

> Status: draft
> Branch: feature/01-calendar-view
> Phase: 1
> Depends on: **05 (background-polling) — 선행 머지 필수**. 본 spec은 폴링이 저장하는 `lectureSnapshot`을 데이터 소스로 소비한다.

> ⚠️ **선행 작업 안내**: 본 spec은 `chrome.storage.local.lectureSnapshot`이 채워져 있다는 가정 위에서 동작한다. spec 05가 머지되어 폴링이 한 번이라도 성공해야 캘린더에 데이터가 보인다. spec 05보다 먼저 코딩 진입하지 말 것.

## 1. 목적

SWM 특강 목록은 표(table) 형태라 "이 주에 무슨 강의가 언제 몰려 있는지"를 한눈에 보기 어렵다. **확장 아이콘 클릭으로 열리는 별도 탭(`calendar.html`)에서 월·주 그리드 캘린더**를 제공해, SoMA 페이지에 들어가지 않아도 시간 분포를 직관적으로 확인하게 한다.

## 2. 사용자 스토리

- as a 연수생, I want 브라우저 어디에서나 확장 아이콘 한 번으로 캘린더를 열고, so that SWM 페이지를 다시 열지 않아도 일정 분포를 본다.
- as a 연수생, I want 캘린더 셀의 특강을 클릭해 SWM 상세 페이지로 이동하고, so that 캘린더에서 직접 신청 흐름으로 진입한다.

## 3. 범위

### 포함
- **확장 아이콘 클릭 → 새 탭으로 `calendar.html` 열기** (이미 열려 있으면 그 탭 활성화)
- 월간 그리드(7일 × 5~6주)와 주간 그리드(7일 × 시간대) 두 모드
- 셀에 특강 카드(시간·제목·상태 배지) 표시
- 카드 클릭 시 SoMA 상세 페이지 새 탭 열기
- 기존 충돌 상태 배지 색을 캘린더 셀에서도 유지
- 월/주 그리드 토글, 이전/다음 기간 이동
- 데이터가 없을 때(폴링 미실행 또는 비활성) 안내 화면 + "옵션에서 폴링 활성화" 링크

### 제외 (다음 phase로)
- 일간 뷰, 사용자 색상 커스터마이즈
- 캘린더에서 직접 신청·취소
- 다중 월 비교 뷰
- 캘린더 페이지 안의 알림 표시(=spec 07·08)
- 캘린더 페이지 안의 필터링·관심 등록 UI(=spec 04·09·10에서 본 페이지 확장)

## 4. 동작 시나리오

### Golden path
1. 사용자가 브라우저 툴바의 확장 아이콘을 클릭한다.
2. service worker가 새 탭으로 `chrome-extension://<id>/src/calendar/calendar.html`을 연다(또는 이미 열린 탭이 있으면 활성화).
3. 캘린더 페이지가 `chrome.storage.local.lectureSnapshot`에서 lecture 배열을 읽어 그리드를 렌더링한다.
4. 기본 모드는 `month`. 상단 토글로 `주` 전환 가능. 모드는 `chrome.storage.local.calendarViewMode`에 저장.
5. 각 날짜 셀에 그날 시작하는 특강 카드가 시간 오름차순으로 표시된다.
6. 특강 카드 좌측 막대는 충돌 상태 색 (`OVERLAP`=빨강 / `BACK_TO_BACK_PREV`=주황 / `CLEAR`=회색 / `UNKNOWN`=흐림).
7. 카드 클릭 시 새 탭으로 SoMA 상세 페이지(`detailUrl`)를 연다.
8. 상단 `이전` / `다음` 버튼으로 그리드 기준 월·주를 이동. 이동 결과는 `calendarAnchorDate`에 저장.
9. 상단에 `마지막 갱신: HH:mm` 표시. `지금 갱신` 버튼은 spec 05의 `POLLING_TRIGGER_NOW` 메시지를 호출한다.

### 엣지 케이스
- `lectureSnapshot`이 비어 있음(폴링 미활성·1회도 미성공): 그리드 대신 "백그라운드 폴링이 아직 실행되지 않았습니다. 옵션 페이지에서 활성화하거나 `지금 갱신`을 눌러주세요." 안내. `옵션 열기` 버튼 + `지금 갱신` 버튼.
- 폴링이 인증 만료로 정지(`pausedReason="auth-expired"`): "SoMA 로그인이 만료되었습니다. SoMA 페이지에서 다시 로그인 후 `지금 갱신` 눌러주세요." 안내.
- 특강이 자정을 넘는 경우(`endAt`이 다음 날): 시작일 셀에만 표시하고 종료 시간은 `+1d` 표기.
- `startAt`이 비어 있어 `UNKNOWN`인 특강: 캘린더에 표시하지 않고 상단에 `시간 미상 N건` 카운트 + 클릭 시 목록 팝오버.
- 같은 셀에 특강이 4개 이상이면 첫 3개만 표시하고 `+N` 더보기. 클릭 시 일자 팝오버.
- 한국 표준시(Asia/Seoul) 기준으로 그룹화. `startAt`은 이미 Seoul ISO이므로 그대로 사용.
- 주간 뷰 시간축 범위는 **08:00~24:00** 고정. 이 범위 밖 특강이 있으면 위/아래 가장자리에 `+N건 (시간 범위 밖)` 표시 후 클릭 시 일자 팝오버에서 노출.

## 5. UI 변경

- **페이지: 신규 — `src/calendar/calendar.html`** (확장 자체 페이지, SoMA DOM과 무관)
- **확장 아이콘 동작**: `manifest.json`의 `action`에 `default_title` 설정. `default_popup`은 두지 않고, service worker의 `chrome.action.onClicked` 핸들러에서 `chrome.tabs.create({ url: "src/calendar/calendar.html" })`. 이미 열린 탭은 `chrome.tabs.query`로 찾아 `chrome.tabs.update({ active: true })`.
- 페이지 레이아웃:
  - 상단 헤더: `월 / 주` 토글, 이전·다음 버튼, 기간 라벨, `마지막 갱신: HH:mm`, `지금 갱신` 버튼, `옵션 열기` 링크
  - 본문: CSS Grid 기반 캘린더 그리드
  - 하단: `시간 미상 N건` / `(주간) 시간 범위 밖 N건` 요약
- 스타일: `src/calendar/calendar.css`. 다크 모드는 phase 1 범위 외(시스템 폰트만 적용).
- mock fixture: `mock/calendar.html`을 추가해 `lectureSnapshot` 모킹 데이터로 그리드 렌더 검증.

## 6. 데이터 모델

기존 lecture 객체(spec 05의 `LectureSnapshot.lectures` 항목과 동일):

```ts
type Lecture = {
  qustnrSn: string;
  id: string;          // qustnrSn과 동일
  title: string;
  place: string;
  startAt: string;     // Seoul ISO datetime
  endAt: string;
  detailUrl: string;
  status?: "OVERLAP" | "BACK_TO_BACK_PREV" | "CLEAR" | "UNKNOWN";
};
```

본 spec이 신규 도입하는 storage:

```ts
// chrome.storage.local
type CalendarViewState = {
  calendarViewMode: "month" | "week"; // 기본 "month"
  calendarAnchorDate?: string;        // ISO date, 캘린더가 보고 있는 월·주 기준
};
```

본 spec이 **읽기만** 하는 storage(spec 05 소유):

```ts
type LectureSnapshot = {
  takenAt: string;
  rangeStart: string;
  rangeEnd: string;
  lectures: Lecture[];
};

type PollingState = {
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  consecutiveFailures: number;
  pausedReason: "auth-expired" | "structure-changed" | "max-retry" | null;
};
```

## 7. 의존성

- 읽기: `lectureSnapshot`(spec 05 소유), `pollingState`(spec 05 소유), `calendarViewMode`, `calendarAnchorDate`
- 쓰기: `calendarViewMode`, `calendarAnchorDate`
- 호출:
  - `chrome.action.onClicked` (service worker에 핸들러 추가)
  - `chrome.tabs.create` / `chrome.tabs.update` / `chrome.tabs.query`
  - `chrome.runtime.sendMessage({ type: "POLLING_TRIGGER_NOW" })` (spec 05의 메시지 재사용)
  - `chrome.storage.onChanged`로 `lectureSnapshot` 변경 감지 → 자동 재렌더

## 8. 변경 / 신규 파일

- 신규:
  - `src/calendar/calendar.html`
  - `src/calendar/calendar.js` (페이지 부트스트랩, storage 읽기, 메시지 송신)
  - `src/calendar/calendar-view.js` (그리드 렌더링·셀 분배 순수 함수)
  - `src/calendar/calendar.css`
  - `tests/unit/calendar-view.test.js` (셀 분배 로직)
  - `mock/calendar.html` 또는 `mock/calendar-fixture.js`
- 수정:
  - `manifest.json`: `action` 블록 추가(`default_title`만, popup 없음), `web_accessible_resources`에 calendar 페이지 자원 필요 여부 확인 후 추가
  - `src/background/service-worker.js`: `chrome.action.onClicked` 핸들러로 calendar 탭 열기/활성화

## 9. 메시지 프로토콜

신규 메시지 없음. spec 05가 정의한 `POLLING_TRIGGER_NOW`, `POLLING_GET_STATE`를 그대로 사용한다.

## 10. 테스트 케이스

- unit (`calendar-view.test.js`)
  - 한 주에 특강 5건이 분포할 때 셀별 카드 수가 맞는지
  - 자정 넘는 특강이 시작일 셀에만 표시되는지
  - `+N` 더보기 임계값
  - 한국 표준시 경계 케이스 (예: 23:55 시작 특강)
  - 주간 뷰 08:00 이전·24:00 이후 특강이 "범위 밖"으로 분류되는지
- DOM (`calendar.html` jsdom 부트스트랩)
  - `lectureSnapshot` 비어 있음 → 안내 화면
  - `pollingState.pausedReason="auth-expired"` → 인증 만료 안내
  - `chrome.storage.onChanged`로 `lectureSnapshot` 갱신 시 그리드 재렌더
- 수동 (`mock/calendar.html` + 실제 빌드)
  - 확장 아이콘 클릭 → 새 탭에 캘린더 열림, 두 번째 클릭 시 같은 탭 활성화
  - 카드 클릭 → SoMA 상세 새 탭
  - `지금 갱신` 클릭 → spec 05 trigger 동작 확인

## 11. 비기능 요구사항

- 추가 권한 없음(spec 05가 이미 `alarms`, `host_permissions` 추가).
- 성능: 1개월 100건 이내 가정. DOM 조작은 한 번에 fragment로 묶어서.
- 접근성: 셀에 `aria-label="YYYY-MM-DD 특강 N건"`. 카드는 키보드 포커스 가능.
- 주간 뷰 시간축: **08:00~24:00 고정**. 범위 밖 특강은 "+N건 (시간 범위 밖)" 요약으로 노출.
- 캘린더 페이지 자체는 외부 fetch를 하지 않는다. 모든 데이터는 `chrome.storage.local`에서.

## 12. 미해결 질문

- `@tbd` 캘린더 셀에서 충돌 패널을 어떻게 보여줄지 — 호버 툴팁 vs 클릭 후 패널. (T-01)
- `@tbd` `calendarAnchorDate`가 `lectureSnapshot.rangeStart/rangeEnd` 범위를 벗어났을 때 동작 — 빈 그리드만 보일지, 폴링에 범위 확장 요청을 보낼지. 후자라면 spec 05에 `POLLING_TRIGGER_NOW` payload(범위)를 추가해야 함.

## 13. 관련 링크

- 코드: `src/content/parsers.js:74` 목록 파싱(spec 05가 호출), `src/background/service-worker.js`
- 관련 spec: **05 background-polling (선행)**, 02 카테고리·03 멘토(메타 표기 합류), 04 필터링(필터 결과를 캘린더에도 반영)
