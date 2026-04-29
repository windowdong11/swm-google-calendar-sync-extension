# Spec 12: Claude 자동 E2E 테스트 환경

> Status: shipped (인프라 + 6/8 시나리오 통과 / B-1 dedupe·B-2 events는 spec 01 회귀로 차단)
> Branch: feature/12-test-automation
> Phase: Infrastructure (라운드 외 도구 트랙)
> Depends on: 01(shipped), 05(shipped) — 첫 자동화 대상 시나리오

## 1. 목적

지금까지 spec 01·05의 라이브 검증(B-1~B-4 + C polling 5단계)을 사용자가 매번 수동으로 진행해 왔다. 본 spec은 **Claude 세션 안에서 단일 명령으로 그 5단계를 ✅/❌ 자동 검증**하는 인프라를 만든다. 동시에 spec 02·03·04·06·08·09·10 등 **앞으로 추가될 모든 시나리오의 테스트도 동일 인프라 위에 helper/페이지 객체/fixture만 추가하면 즉시 자동화** 되도록 일반화 기반을 마련한다.

본 spec은 **src/ 코드 변경 없음**. 새 디렉토리 `tests/e2e/` + devDep 1개(`@playwright/test`) + GitHub Actions 워크플로 1개만 추가.

## 2. 사용자 스토리

- as 사용자, I want Claude가 spec 작업 후 라이브 검증까지 스스로 돌리고 결과만 보고하길, so that 매번 Chrome 확장 unpacked 로드·아이콘 클릭·DevTools 콘솔 입력을 반복하지 않는다.
- as 다음 spec 작성자(Claude·사람), I want 새 시나리오를 5분 안에 추가할 수 있는 템플릿과 헬퍼를, so that 테스트 자동화가 매 spec마다 처음부터 만들어지지 않는다.
- as CI, I want push·PR마다 5개 시나리오가 자동 실행되어 회귀를 즉시 잡길.

## 3. 범위

### 포함
- Playwright + Chromium persistent context 기반 E2E 러너 (`@playwright/test`)
- 확장 unpacked 자동 로드 (`--load-extension`)
- OAuth/Google Calendar/SoMA 호출 fetch 레이어 가로채기 (mock 응답 주입)
- 5개 시나리오 자동 검증: B-1 toolbar / B-2 calendar / B-3 drag / B-4 card / C polling
- 헬퍼 6종 (launch/sw/stub-identity/route-google/route-soma/keep-alive)
- Page Object 3종 (calendar/list/detail)
- 신규 시나리오 작성 가이드 (`tests/e2e/AUTHORING.md`) + 템플릿
- GitHub Actions 워크플로 (push·PR 트리거, headless)

### 제외 (명시적으로 빼는 것)
- 실 OAuth interactive 인증 회귀 (Chrome `chrome.identity.getAuthToken` 자체는 외부 자동화 API 미제공)
- 실 SoMA 로그인 쿠키 만료/재로그인 UX 회귀 (HTML fixture만으로는 못 잡음 → `npm run refresh:fixtures` 사용자 주기적 실행으로 보완)
- 실 Google Calendar API 응답 회귀 (page.route mock으로 대체)
- 비Chromium 호환성 (Chrome `chrome.identity` 의존)
- 시각적/픽셀 회귀 (toBeVisible 수준만)
- fixture 자동 갱신 (별도 `chore/anonymize-fixtures-tooling`이 담당)
- `mock/mock-env.js` 변경 (브라우저 수동 확인용으로 유지, 본 인프라와 분리)

## 4. 동작 시나리오

### Golden path (사용자 명령)
1. 처음 한 번: `npm run test:e2e:install` (Chromium ~170MB 다운로드, 캐시됨)
2. 매 검증: `npm run test:e2e` → 5개 spec 결과 ✅/❌
3. 디버깅: `HEADLESS=0 npm run test:e2e -- b3` (창 보면서 단일 시나리오)
4. CI: push·PR마다 자동 실행, 결과 PR 체크에 표시

### 시나리오별 검증 흐름

**B-1 toolbar opens calendar**
- 확장 로드 → SW에서 `chrome.action.onClicked` 핸들러 직접 호출 (Playwright는 toolbar 클릭 직접 API 없음)
- 새 page event 대기 → URL이 `chrome-extension://<id>/src/calendar/calendar.html` 인지
- 두 번째 호출 → page count 변화 없는지

**B-2 calendar renders**
- `chrome.identity.getAuthToken` SW eval로 stub (fake token)
- `context.route("https://www.googleapis.com/calendar/v3/**")` → `tests/e2e/fixtures/google-events.json` 응답
- calendar.html 열고 `.time-axis [data-hour="8"]`·`[data-hour="23"]`·`[data-event-id=...]` visible 확인

**B-3 drag empty area filters lectures**
- `chrome.storage.local` seed: `lectureSnapshot.lectures = [...]` (mock-env.js와 분리된 e2e fixture)
- calendar.html 열고 빈 셀 좌표 계산 → mouse.move/down/move/up 드래그
- 사이드 패널 `[data-suggestion-card]` count > 0

**B-4 card click opens SoMA detail**
- B-3 setup + 카드 클릭 → `ctx.waitForEvent("page")` popup URL이 `swmaestro.ai/sw/mypage/mentoLec/view.do` 매칭

**C polling populates snapshot**
- `context.route("https://swmaestro.ai/sw/mypage/**")` → `tests/fixtures/site-current/list.html` 응답 (offscreen 파싱은 실제 실행)
- `chrome.storage.sync.set({pollingSettings:{enabled,intervalMinutes,rangeDays}})` + `POLLING_TRIGGER_NOW`
- 1.5s 대기 → `chrome.storage.local.get('lectureSnapshot')`의 `lectures.length > 0`

### 엣지 케이스
- MV3 service worker가 30초 idle 종료 → `keep-alive.js` 헬퍼가 주기적 `chrome.runtime.getPlatformInfo` ping. helper에서 `Target closed` 시 SW 핸들 재획득 (`ctx.waitForEvent("serviceworker")`).
- Chromium 다운로드 실패(네트워크 차단) → `npm run test:e2e:install` 실패 메시지 → 사용자 수동 재시도.
- fixture HTML 구조와 실제 SoMA DOM 차이 → `tests/fixtures/site-current/`가 회귀의 단일 진실 소스. `npm run refresh:fixtures`로 갱신.
- `chrome.action.onClicked` 핸들러 직접 호출 한계 → "사용자가 toolbar 아이콘을 봤을 때 보이는가"는 자동 검증 못 함. spec 12에서 명시 비목표.

## 5. UI 변경

없음 (테스트 인프라).

## 6. 데이터 모델

자동 테스트가 사용하는 fixture 구조 (`tests/e2e/fixtures/`):

```jsonc
// google-events.json — Google Calendar API list 응답 흉내
{
  "kind": "calendar#events",
  "items": [
    { "id": "evt-001", "summary": "기존 미팅",
      "start": { "dateTime": "2026-04-30T10:00:00+09:00" },
      "end":   { "dateTime": "2026-04-30T11:00:00+09:00" } }
  ]
}
```

```js
// lectures.js — chrome.storage.local.lectureSnapshot.lectures seed
module.exports = {
  DEFAULT_LECTURES: [
    { qustnrSn: "lec-001", title: "...", startAt: "...", endAt: "...", url: "...", applied: false }
  ]
};
```

mock-env.js의 DEFAULT_LECTURES와는 의도적으로 분리 (mock-env.js는 IIFE라 require 불가, e2e 인프라는 mock-env.js 변경에 결합되면 안 됨).

## 7. 의존성

- 읽기:
  - `tests/fixtures/site-current/list.html`·`detail.html` — SoMA mock 응답에 그대로 사용
  - `manifest.json` — 확장 ID 추출, `oauth2.client_id` 무관
  - `src/calendar/`, `src/background/` — Page Object가 셀렉터·메시지 타입 알아야 함 (코드 수정 X, 읽기만)
- 쓰기:
  - 신규 `tests/e2e/**`
  - 신규 `.github/workflows/test.yml`
  - 수정 `package.json` (devDep + scripts)
  - 수정 `CLAUDE.md` (명령어 섹션 1줄)
  - 수정 `docs/specs/NEXT-SESSION.md` (인계 1줄)
- 호출:
  - Playwright API (`chromium.launchPersistentContext`, `BrowserContext.serviceWorkers`, `BrowserContext.route`, `Page.mouse`, `expect`)
  - 기존 service worker 메시지 타입(`GET_CALENDAR_EVENTS`, `POLLING_TRIGGER_NOW`) — 정의는 `agent-guide.md` §7 참조

## 8. 변경 / 신규 파일

### 신규
- `tests/e2e/playwright.config.js` — testDir, workers:1, retries:1, HEADLESS env 분기
- `tests/e2e/helpers/launch.js` — `launch()` → `{ ctx, sw, extId }`
- `tests/e2e/helpers/sw.js` — `swEval`/`swSetStorage`/`swSendMessage`/`swDispatchActionClick` wrapper (SW idle 재획득 포함)
- `tests/e2e/helpers/stub-identity.js` — `chrome.identity` monkey-patch (fake token)
- `tests/e2e/helpers/route-google.js` — `routeGoogle(ctx, eventsJson)` — googleapis.com 라우팅
- `tests/e2e/helpers/route-soma.js` — `routeSoma(ctx, opts)` — swmaestro.ai 라우팅 + fixtures HTML 매핑
- `tests/e2e/helpers/keep-alive.js` — SW 주기 ping
- `tests/e2e/pages/calendar.page.js` — Page Object: 캘린더 페이지 (open/waitForGrid/dragRange/suggestionCards/clickCard)
- `tests/e2e/pages/list.page.js`, `detail.page.js` — 향후 Track B용 stub
- `tests/e2e/fixtures/google-events.json` + `lectures.js` + `README.md` (fixture 컨벤션)
- `tests/e2e/scenarios/{b1-toolbar,b2-calendar,b3-empty-drag,b4-card-open,c-polling}.spec.js`
- `tests/e2e/AUTHORING.md` — 신규 시나리오 5단계 + 템플릿
- `.github/workflows/test.yml` — push·PR 트리거 자동 회귀

### 수정
- `package.json` — `@playwright/test` devDep + `test:e2e` / `test:e2e:install` / `test:all` scripts
- `CLAUDE.md` — `## 명령어`·`## 실행 환경` 섹션에 `npm run test:e2e` 추가
- `docs/specs/NEXT-SESSION.md` — 도구 트랙 한 줄 등록

### 미변경 보장
- `src/**`, `manifest.json`, `mock/**`, `tests/unit/**`, `tests/fixtures/site-current/**`

## 9. 메시지 프로토콜

신규 메시지 없음. 기존 `GET_CALENDAR_EVENTS`·`POLLING_TRIGGER_NOW`·`POLLING_GET_STATE` 등을 자동 테스트가 SW evaluate로 호출.

## 10. 테스트 케이스

본 spec은 테스트 인프라 자체이므로 "테스트의 테스트"가 자동 회귀임:

- `npm run test:e2e` 5개 spec 모두 통과 (B-1·B-2·B-3·B-4·C)
- `HEADLESS=1 npm run test:e2e` headless='new' 모드 통과
- `npm test` 회귀 없음 (기존 단위 테스트 영향 0)
- 네트워크 차단 환경에서도 5개 spec 통과 (모든 외부 호출이 mock으로 대체되었는지 확인)
- `mock/mock-env.js` 수동 검증 흐름 영향 없음 (브라우저 콘솔 로드 시 동작 변화 없음)
- CI: GitHub Actions에서 5개 spec 모두 ✅

## 11. 비기능 요구사항

- Chromium 다운로드 ~170MB (한 번, `~/.cache/ms-playwright` 캐시). CI에서는 `actions/cache@v4`로 영구 캐시.
- 매 시나리오 실행 시간 ~5~10초, 5개 합 ~30~60초 (CI 합 ~2분 첫 실행 / ~40초 캐시 후).
- service worker idle 종료 race로 인한 flake 위험 → `retries: 1` + `keep-alive.js`로 완화.
- 보안: fake token은 단순 문자열, 실제 Google API 호출 0건. SoMA 로그인 자격증명 0건. `.agent/*.local.json` 미참조.

## 12. 미해결 질문 / 발견된 spec 01 회귀

### 본 spec 인프라가 자동 발견한 spec 01 회귀 2건 (별도 fix PR 필요)

- **B-7-1: GET_CALENDAR_EVENTS 응답 형식 불일치** — `src/background/service-worker.js:200-217` `normalizeEvent`가 Google API 응답을 `{ id, title, startAt, endAt, htmlLink, calendarId, transparency, isSomaLecture, somaQustnrSn }` 평면 객체로 변환해 보낸다. 그러나 `src/calendar/calendar-view.js:66`의 `splitEventByDay`는 `event.start.dateTime` raw 형식을 기대해, events가 1개라도 있으면 `Cannot read properties of undefined (reading 'dateTime')`로 그리드 렌더가 죽는다. 단위 테스트는 raw 형식으로 시뮬해 통과해 머지된 듯. 수정 방향: (a) `calendar-view.js`가 평면 형식을 받게 하거나 (b) service-worker가 raw items 그대로 전달. (a)가 단위 테스트 영향 적음.
- **B-7-2: manifest.json `tabs` permission 누락** — `src/background/service-worker.js:803`의 `chrome.action.onClicked` 핸들러가 `chrome.tabs.query({ url: calendarUrl })`로 기존 탭 dedupe를 시도하지만, manifest permissions에 "tabs"가 빠져 있어 query 결과의 url 필드가 빈 값. 결과: dedupe 실패 → 매 클릭마다 새 탭 생성. 수정 방향: manifest.json `permissions`에 `"tabs"` 추가 또는 `chrome.storage`로 last calendar tab id 추적.

위 2건이 fix되면 `tests/e2e/scenarios/b1-toolbar.spec.js`의 dedupe 시나리오와 `b2-calendar.spec.js`의 events 시나리오에서 `test.skip`을 제거해 8/8 활성화.

### 본 spec 자체 미해결

- T-12-1: `chrome.action.onClicked` 자체의 등록된 listener를 직접 invoke할 표준 API가 없음. 현재는 SW evaluate에서 핸들러와 동일한 흐름을 호출(검증). future Chrome 버전에서 핸들러 코드가 변경되면 시나리오에서 동기화 필요. 단위 테스트(`tests/unit/service-worker-sync.test.js` 등)에서 listener 등록 자체를 별도 검증.
- T-12-2: `HEADLESS=1` 모드는 Playwright의 `chromium-headless-shell` 빌드를 사용해 MV3 service worker 부팅이 실패한다 (`browserContext.waitForEvent("serviceworker") timeout`). 알려진 한계로, CI는 `xvfb-run` + `headless=false`로 우회 (`.github/workflows/test.yml`). 향후 Playwright/Chromium 업데이트로 해소되면 `HEADLESS=1` 활성화.
- T-12-3: `tests/e2e/fixtures/lectures.js`의 DEFAULT_LECTURES와 `mock/mock-env.js`의 데이터를 한쪽으로 통합할지. 현재는 분리 (mock-env.js IIFE). 향후 둘 다 CJS로 옮기면 단일 소스화 가능.

## 13. 관련 링크

- 코드 라인:
  - `src/background/service-worker.js:802-820` (action.onClicked)
  - `src/background/service-worker.js:860-869` (GET_CALENDAR_EVENTS 핸들러)
  - `src/background/service-worker.js:903-907` (POLLING_TRIGGER_NOW 핸들러)
  - `src/calendar/calendar.js:239-297` (드래그 핸들러)
  - `src/calendar/calendar-view.js:353-365` (카드 클릭 → window.open)
- 외부 문서:
  - Playwright Chrome Extensions guide
  - Chrome Manifest V3 Service Worker lifecycle
- 관련 spec: 01(shipped), 05(shipped). 향후 02·03·04·06·08·09·10·11이 본 인프라 위에 시나리오 추가.
