# Spec 01: 캘린더 뷰

> Status: draft
> Branch: feature/01-calendar-view
> Phase: 1
> Depends on: 없음 (lecture 파서가 이미 `startAt`/`endAt` 제공)

## 1. 목적

SWM 특강 목록은 표(table) 형태라 "이 주에 무슨 강의가 언제 몰려 있는지"를 한눈에 보기 어렵다. 같은 데이터를 **월·주 그리드 캘린더**로 보여 시간 분포를 직관적으로 파악하게 한다.

## 2. 사용자 스토리

- as a 연수생, I want 특강 목록을 캘린더 그리드로 보고, so that 어느 시간대에 강의가 몰려 있는지 빠르게 알 수 있다.
- as a 연수생, I want 캘린더 셀의 특강을 클릭해 상세로 이동하고, so that 기존 흐름을 끊지 않고 신청까지 갈 수 있다.

## 3. 범위

### 포함
- 특강 목록 페이지(`mentoLec/list.do`)에 캘린더 뷰 토글
- 월간 그리드(7일 × 5~6주)와 주간 그리드(7일 × 시간대) 두 모드
- 셀에 특강 카드(시간·제목·상태 배지) 표시
- 카드 클릭 시 상세 페이지 새 탭 열기
- 기존 충돌 상태 배지 색을 캘린더 셀에서도 유지
- 캘린더 ↔ 표 뷰 토글 버튼

### 제외 (다음 phase로)
- 일간 뷰, 사용자 색상 커스터마이즈
- 캘린더에서 직접 신청·취소
- 다중 월 비교 뷰
- Phase 2의 알림 표시는 알림 spec(07)에서

## 4. 동작 시나리오

### Golden path
1. 사용자가 특강 목록 페이지를 연다.
2. 기존 날짜 조회 바 옆에 `표 / 월 / 주` 토글이 보인다. 기본은 `표`.
3. `월`을 누르면 표 영역이 캘린더 월간 그리드로 교체된다. 기준 월은 현재 날짜 범위의 시작 월.
4. 각 날짜 셀에 그날 시작하는 특강 카드가 시간 오름차순으로 표시된다.
5. 특강 카드 좌측 막대는 충돌 상태 색 (`OVERLAP`=빨강 / `BACK_TO_BACK_PREV`=주황 / `CLEAR`=회색 / `UNKNOWN`=흐림).
6. 카드 클릭 시 새 탭으로 상세 페이지를 연다.
7. `다음 달` / `이전 달` 버튼으로 그리드 월을 이동하면 날짜 조회 범위도 따라 갱신되어 데이터 fetch가 자동 재실행된다.

### 엣지 케이스
- 특강이 자정을 넘는 경우(예: `endAt`이 다음 날): 시작일 셀에만 표시하고 종료 시간은 `+1d` 표기.
- `startAt`이 비어 있어 `UNKNOWN`인 특강: 캘린더에 표시하지 않고, 표 뷰로 전환 시에만 보이도록 (사용자가 놓치지 않게 작은 안내 카운트 노출 — 예: `시간 미상 3건`).
- 같은 셀에 특강이 4개 이상이면 첫 3개만 표시하고 `+N` 더보기. 클릭 시 일자 팝오버.
- 한국 표준시(Asia/Seoul) 기준으로 그룹화. `startAt`은 이미 Seoul ISO이므로 그대로 사용.

## 5. UI 변경

- 페이지: 특강 목록 (`mentoLec/list.do`)
- 위치: 기존 날짜 조회 바(`src/content/content.js`에서 삽입) 우측에 `뷰: 표 / 월 / 주` 토글. 토글 상태는 `chrome.storage.local`의 `listViewMode` 키에 저장(기본 `table`).
- 그리드 컨테이너: 표(`.boardlist` 또는 동등)를 `display: none` 처리하지 말고, 같은 부모 안에 형제 div(`.swm-calendar`)로 추가. 토글 시 표 ↔ 캘린더가 한쪽만 보이도록.
- 스타일: `src/content/styles.css`에 추가. CSS Grid 사용.
- mock fixture: `mock/list.html`을 캘린더 토글 검증용으로 확장. 한 주에 여러 특강이 들어간 시나리오 추가.

## 6. 데이터 모델

기존 lecture 객체 사용 (parser 결과):

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

신규 storage:

```ts
// chrome.storage.local
type ViewState = {
  listViewMode: "table" | "month" | "week"; // 기본 "table"
  calendarAnchorDate?: string;               // ISO date, 캘린더가 보고 있는 월·주 기준
};
```

## 7. 의존성

- 읽기: 기존 파싱 결과(lecture 배열), 충돌 상태, `chrome.storage.local.listViewMode`
- 쓰기: `listViewMode`, `calendarAnchorDate`
- 호출: 신규 API 호출 없음. 기존 `GET_CALENDAR_EVENTS` 결과 그대로 활용.

## 8. 변경 / 신규 파일

- 신규: `src/content/calendar-view.js` (그리드 렌더링·토글), CSS 추가 블록
- 수정: `src/content/content.js` (토글 삽입 지점, lecture 배열을 calendar-view로 전달), `src/content/styles.css`, `manifest.json`의 list 페이지 content_scripts에 `calendar-view.js` 추가, `mock/list.html`
- 테스트: `tests/unit/calendar-view.test.js` (그리드 셀 분배 로직), `tests/unit/content-scripts.test.js`에 토글 상호작용 케이스 추가

## 9. 메시지 프로토콜

신규 메시지 없음.

## 10. 테스트 케이스

- unit (`calendar-view.test.js`)
  - 한 주에 특강 5건이 분포할 때 셀별 카드 수가 맞는지
  - 자정 넘는 특강이 시작일 셀에만 표시되는지
  - `+N` 더보기 임계값
  - 한국 표준시 경계 케이스 (예: 23:55 시작 특강)
- DOM (`content-scripts.test.js`)
  - 토글 클릭 시 `.boardlist`가 숨겨지고 `.swm-calendar`가 보이는지
  - `listViewMode` 저장·복원
- 수동 (`mock/list.html`)
  - 토글 동작, 카드 클릭으로 상세 새 탭
  - 다음/이전 월 이동 시 날짜 조회 자동 재실행

## 11. 비기능 요구사항

- 추가 권한 없음.
- 성능: 1개월 100건 이내 가정. DOM 조작은 한 번에 fragment로 묶어서.
- 접근성: 셀에 `aria-label="YYYY-MM-DD 특강 N건"`.

## 12. 미해결 질문

- `@user` 기본 뷰 모드를 `table`로 둘지 `month`로 둘지. (UX 측면에서 도입 직후엔 `table`이 안전)
- `@user` 주간 뷰의 시간축 범위(예: 09:00~22:00 vs 24시간). 특강이 보통 18~22시인지 확인 필요.
- `@tbd` 캘린더 셀에서 충돌 패널을 어떻게 보여줄지 — 호버 툴팁 vs 클릭 후 패널.

## 13. 관련 링크

- 코드: `src/content/content.js` 날짜 조회 바 삽입부, `src/content/parsers.js:74` 목록 파싱
- 관련 spec: 02 카테고리 분류, 04 필터링 (필터 결과를 캘린더에도 적용)
