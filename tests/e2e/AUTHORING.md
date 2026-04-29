# tests/e2e — 신규 시나리오 작성 가이드

본 문서는 spec 12 인프라 위에 **새 spec의 자동 검증 시나리오를 추가하는 절차**를 정의한다. 5단계로 끝난다.

## 핵심 인프라

| 헬퍼 | 용도 |
|---|---|
| `helpers/launch.js` | `launch()` → `{ ctx, sw, extId, cleanup }` 표준 핸들 |
| `helpers/sw.js` | `swEval`, `swSetStorage`, `swGetStorage`, `swSendMessage(ctx, extId, msg)` |
| `helpers/stub-identity.js` | `stubIdentity(ctx)` / `stubIdentityFailure(ctx, msg)` |
| `helpers/route-google.js` | `routeGoogle(ctx, { events })` — googleapis.com 가로채기 |
| `helpers/route-soma.js` | `routeSoma(ctx, { listHtml, detailHtml, historyHtml })` — swmaestro.ai 가로채기 |
| `helpers/keep-alive.js` | `startKeepAlive(ctx)` — 긴 시나리오에서 SW idle 방지 |
| `pages/calendar.page.js` | Calendar 페이지 셀렉터·드래그·카드 클릭 |
| `pages/list.page.js`, `detail.page.js` | SoMA 페이지 (향후 spec 02·06 등에서 확장) |

## 5단계 절차

### 1. spec 정의
`docs/specs/NN-*.md`의 §10 `테스트 케이스`에 자동 시나리오로 옮길 항목을 명시. 예:
- "B-3: 빈 영역 드래그 → 사이드 패널 카드 1개 이상" → 자동
- "라이브 환경에서 토스트 알림 보임" → 수동 (Chrome OS DND 등 환경 의존)

### 2. fixture 추가 (필요 시)
- 캘린더 이벤트: `tests/e2e/fixtures/google-events*.json` 추가 또는 시나리오 안에서 인라인 객체.
- SoMA HTML: 기본 `tests/fixtures/site-current/*.html` 재사용. 시나리오별 변형이 필요하면 `routeSoma(ctx, { listHtml: "<custom html>" })`.
- 강의 데이터: `tests/e2e/fixtures/lectures.js`의 `DEFAULT_LECTURES` 또는 시나리오 안에서 인라인.
- **시각은 항상 미래(2099 권장) 또는 동적 계산** (`new Date(); +N days`) — 시스템 시계에 의존 금지.

### 3. Page Object 신규/확장
- 새 페이지(예: 옵션 페이지) → `tests/e2e/pages/<name>.page.js` 추가.
- 기존 페이지에 새 동작 → 같은 클래스에 메서드 추가. 셀렉터는 한 곳에서.
- 셀렉터는 `data-*` 속성·DOM 클래스·텍스트 매칭 사용. 인라인 스타일·index 의존은 회피.

### 4. 시나리오 spec 작성
파일 위치: `tests/e2e/scenarios/<spec-id>-<short>.spec.js`. 예: `02-category-mapping.spec.js`.

템플릿:

```js
"use strict";

const { test, expect } = require("@playwright/test");
const { launch } = require("../helpers/launch");
const { stubIdentity } = require("../helpers/stub-identity");
const { routeGoogle } = require("../helpers/route-google");
const { routeSoma } = require("../helpers/route-soma");
const { swSetStorage, swGetStorage, swSendMessage } = require("../helpers/sw");
const { CalendarPage } = require("../pages/calendar.page");

test.describe("Spec NN: <기능 이름>", () => {
  let handle;

  test.afterEach(async () => {
    if (handle) await handle.cleanup();
    handle = null;
  });

  test("<시나리오 한 줄 설명>", async () => {
    handle = await launch();

    // 1) 외부 호출 mock
    await stubIdentity(handle.ctx);
    await routeGoogle(handle.ctx, { events: { kind: "calendar#events", items: [] } });
    // 폴링/SoMA가 필요하면:
    // await routeSoma(handle.ctx);

    // 2) storage seed
    await swSetStorage(handle.ctx, "local", { /* lectureSnapshot 등 */ });
    await swSetStorage(handle.ctx, "sync", { /* pollingSettings 등 */ });

    // 3) extension page 열기 또는 메시지 발송
    const page = await handle.ctx.newPage();
    const cal = new CalendarPage(page, handle.extId);
    await cal.open();
    await cal.waitForGrid();

    // 4) 단언
    await expect(/* ... */).toBeVisible();
  });
});
```

### 5. 단일 실행 검증
```bash
npm run test:e2e -- scenarios/<spec-id>-<short>.spec.js
```
통과 후 PR에 포함. 전체 회귀(`npm run test:e2e`)도 통과해야 머지.

## 자주 쓰는 패턴

- **calendar.html 열기 + 그리드 대기**: `cal.open()` → `cal.waitForGrid()`
- **빈 영역 드래그**: `cal.dragRange("YYYY-MM-DD", startHour, endHour)`
- **카드 클릭 + popup 캡처**: `Promise.all([ctx.waitForEvent("page"), cal.suggestionCards().first().click()])`
- **service worker로 메시지 발송 (자기 자신 X)**: `swSendMessage(ctx, extId, { type: "..." })` — 임시 calendar.html 페이지를 열고 거기서 sendMessage하는 우회. SW가 자기에게 sendMessage하면 "Receiving end does not exist" 에러.
- **chrome.action.onClicked 시뮬**: `swEval(ctx, async () => { /* 핸들러 동일 흐름 */ })`. Playwright는 toolbar 아이콘 직접 클릭 불가.

## 자동화 한계

자동 검증 불가 항목 (spec 12 §3 제외 항목):
- 실 OAuth interactive 동의 화면
- 실 SoMA 로그인 쿠키 만료/재로그인
- chrome.action 아이콘이 toolbar에 실제로 그려지는지 (`chrome.action.setIcon` 시각 회귀)
- Chrome OS / macOS 알림 센터 동작 (spec 08)
- 비Chromium 브라우저 호환성

이런 항목은 spec 본문 §10에 "수동 확인" 섹션으로 남기고 사용자가 분기마다 한 번씩 통과 확인.

## 디버깅 팁

- 페이지 console error 캡처: `page.on("pageerror", err => console.log("[err]", err.message))`
- 그리드/카드 안 떴을 때: `await page.locator("#cal-grid").innerHTML()` 으로 실제 DOM 확인
- SW 상태: `await swEval(ctx, async () => ({ tabs: await chrome.tabs.query({}), storage: await chrome.storage.local.get() }))`
- trace 보기: `npx playwright show-trace test-results/<scenario>/trace.zip`
- visible 모드 강제 (디버깅): 기본 `headless=false`이므로 그대로 실행하면 Chrome 창에서 흐름 보임. headless 모드는 MV3 SW 부팅 race로 권장하지 않음.

## 신규 spec PR 체크리스트

- [ ] `docs/specs/NN-*.md` §10에 자동/수동 구분 명시
- [ ] fixture 시각이 미래/동적 (시스템 시계 무관)
- [ ] Page Object에 신규 셀렉터 등록 (인라인 셀렉터 금지)
- [ ] `npm run test:e2e -- <spec>` 단일 실행 통과
- [ ] `npm run test:e2e` 전체 회귀 통과
- [ ] CI(GitHub Actions)에서도 통과 (`.github/workflows/test.yml`)
