# Task B-7: spec 01 라이브 회귀 2건 fix

> Status: open · 차단: 🛑 spec 12 두 시나리오·라이브 사용자 흐름
> Branch: `fix/spec-01-regressions`
> 발견: 2026-04-30, spec 12 자동 검증
> 예상 작업: 30~60분 (단발 fix)

## 1. 발견 경위

spec 01 calendar-view (2026-04-29 머지) 시 라이브 환경 미검증으로 두 회귀가 누락된 채 통과. 다음 날 spec 12 (Playwright E2E) 인프라가 자동 검증을 시도하다 두 시나리오에서 fail로 발견됨.

차단되는 시나리오 (현재 `test.skip`로 의도적 비활성):
- `tests/e2e/scenarios/b1-toolbar.spec.js:63` `second click reuses existing calendar tab` (B-7-2 의존)
- `tests/e2e/scenarios/b2-calendar.spec.js:49` `renders hour labels 08:00 and 23:00 with mock event block` (B-7-1 의존)

라이브 영향:
- B-7-1: 사용자가 calendar.html 열면 그리드 본체 렌더 fail (`Cannot read properties of undefined (reading 'dateTime')`)
- B-7-2: 사용자가 확장 아이콘을 두 번째 클릭해도 기존 calendar 탭이 활성화되지 않고 새 탭이 또 열림 (중복)

## 2. B-7-1 GET_CALENDAR_EVENTS 응답 형식 불일치

### 원인
service-worker가 Google Calendar API의 raw event를 평면화해서 보내는데, calendar-view는 raw 형식을 기대.

- `src/background/service-worker.js:200-217` `normalizeEvent`가 Google API items를 다음 형식으로 변환:
  ```js
  { id, title, startAt, endAt, htmlLink, calendarId, transparency, isSomaLecture, somaQustnrSn }
  ```
- `src/calendar/calendar-view.js:66` `splitEventByDay`는 `event.start.dateTime`을 기대 → 평면 형식에 `event.start`가 없어 throw.
- 단위 테스트(`tests/unit/calendar-view.test.js`)는 raw 형식으로 시뮬해 통과 → 머지 통과한 이유.

### 수정 방침
calendar-view가 평면 형식도 받도록:
- `splitEventByDay`, `isOutOfWeekRange`에서 `event.startAt || event.start?.dateTime` 패턴
- `isSomaManaged`에서 `event.isSomaLecture || event.extendedProperties?.private?.somaManaged === "1"` fallback
- `htmlLink` 그대로 사용 (양쪽 형식 동일 키)

테스트 추가:
- `tests/unit/calendar-view.test.js`에 평면 형식 픽스처 케이스 추가 (raw 케이스 보존)

대안(택일): service-worker가 raw 형식을 그대로 보내도록 `normalizeEvent` 제거. 단 다른 호출처(content/content.js, content/apply.js) 영향 점검 필요 → calendar-view 쪽 보강이 더 안전.

## 3. B-7-2 manifest.json `tabs` permission 누락

### 원인
`src/background/service-worker.js:803` `chrome.action.onClicked` 핸들러:
```js
const [existingTab] = await chrome.tabs.query({ url: calendarUrl });
```
`tabs` permission이 없으면 `tab.url` 필드가 빈 문자열로 반환 → URL 매칭 실패 → 항상 새 탭 생성.

### 수정 방침
`manifest.json` `permissions` 배열에 `"tabs"` 추가 (가장 단순):
```json
"permissions": ["storage", "identity", "alarms", "offscreen", "tabs"]
```

대안: `chrome.storage.local.lastCalendarTabId`로 마지막 탭 id 추적해 `chrome.tabs.get()`으로 확인. 단점: 사용자가 탭 닫으면 stale, 코드 복잡.

권한 추가 영향: Chrome 확장 설치 시 사용자에게 추가 권한 안내 표시. 1차 출시 전이라 영향 작음.

## 4. 검증

### 머지 전
1. `npm test` → 108+신규 평면 케이스 = pass
2. `npm run test:e2e` (헤드풀) → 두 skip 제거 후 8/8 pass
3. mock/calendar.html을 unpacked 확장에서 직접 열어 그리드 렌더 확인
4. 확장 아이콘 두 번 클릭 → 같은 탭 활성화 확인 (실 Chrome)

### 커밋 분할 권장
- `fix(calendar-view): accept flat GET_CALENDAR_EVENTS payload from service-worker` (B-7-1 + 단위 테스트)
- `fix(manifest): add tabs permission for chrome.action onClicked dedupe` (B-7-2)
- `test(e2e): re-enable b1-toolbar #2 and b2-calendar #1 after regressions fix`
- `docs: mark B-7 resolved in NEXT-SESSION`

## 5. 다음 세션 진입 프롬프트

```
SOMA Schedule Helper 작업 디렉토리(/Users/wondong-gyu/Desktop/agents/soma-schedule-helper)에서 B-7 spec 01 회귀 2건 fix 진입.

배경:
- spec 01 (calendar-view) 머지 후 spec 12 (Playwright E2E)가 라이브 회귀 2건 자동 발견
- 두 시나리오는 현재 test.skip 처리, 라이브 사용자 흐름도 깨진 상태

상세는 docs/agent-troubleshooting/task-b7-spec01-regression.md 그대로 따라 진행:
1. fix/spec-01-regressions 브랜치 컷 (main에서)
2. B-7-1 fix: src/calendar/calendar-view.js의 splitEventByDay·isOutOfWeekRange·isSomaManaged가 평면 형식(event.startAt 등) fallback 지원
3. B-7-1 단위 테스트 추가: tests/unit/calendar-view.test.js에 평면 형식 픽스처 케이스
4. B-7-2 fix: manifest.json permissions 배열에 "tabs" 추가
5. tests/e2e/scenarios/b1-toolbar.spec.js:63 + b2-calendar.spec.js:49의 test.skip 제거
6. 검증: npm test 통과 + npm run test:e2e (헤드풀) 8/8 pass
7. 커밋 4개로 분할(작업 문서 §4 참조), main fast-forward 머지
8. NEXT-SESSION §1·§4 B-7 ✅ 해소 표기, §9 변경 이력 갱신, docs commit

E2E HEADLESS=1 모드 timeout 문제는 별도 task B-8로 분리됨(docs/agent-troubleshooting/task-b8-e2e-headless.md). 본 task에서는 헤드풀로만 검증.

code-delegate 위임 권장(coder sonnet → reviewer sonnet 사이클).
```

## 6. 관련 링크

- spec 01: `docs/specs/01-calendar-view.md`
- spec 12: `docs/specs/12-test-automation.md`
- service-worker 핸들러: `src/background/service-worker.js:200`(normalizeEvent), `:803`(action.onClicked)
- calendar-view: `src/calendar/calendar-view.js:66`(splitEventByDay)
- 회귀 테스트: `tests/e2e/scenarios/b1-toolbar.spec.js`, `b2-calendar.spec.js`
- 본 task와 묶일 후속: B-8 (HEADLESS=1 timeout) — 두 task는 독립 진행 가능
