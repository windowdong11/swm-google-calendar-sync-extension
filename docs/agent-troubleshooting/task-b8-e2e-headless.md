# Task B-8: E2E HEADLESS=1 모드 service worker timeout fix

> Status: open · 차단: ⏸️ HEADLESS 모드(CI·백그라운드)에서만 fail. 헤드풀은 정상.
> Branch: `fix/e2e-headless-sw-timeout` (main에서 cut)
> 발견: 2026-04-30, Claude Code Bash 환경에서 `HEADLESS=1 npm run test:e2e` 실행 시
> 예상 작업: 30~60분 (단발 fix, 수정 옵션 비교 후 1~2개 적용)

## 0. 세션 분리 운영 메모

본 task는 **B-7과 별도 세션에서 독립 진행**하도록 설계됨.

- **선행 조건**: spec 12 (`feature/12-test-automation`) 가 **main에 머지된 후** 진입. 미머지 상태면 진입 세션이 먼저 spec 12 머지를 처리하거나, 그 브랜치 위에 cut 후 spec 12와 같이 머지.
- **B-7(`fix/spec-01-regressions`)과의 충돌 영역**: 없음.
  - 본 task: `tests/e2e/helpers/launch.js`, (선택) `tests/e2e/playwright.config.js`, `.github/workflows/test.yml`
  - B-7: `src/calendar/calendar-view.js`, `manifest.json`, `tests/unit/calendar-view.test.js`, `tests/e2e/scenarios/b1-toolbar.spec.js`, `b2-calendar.spec.js`
  - → worktree 병렬 또는 시간차 순차 모두 안전. 어느 task가 먼저 머지되어도 다른 쪽 rebase 비용 0.
- **권장 순서**: B-7 머지 후 본 task 진입 시 `HEADLESS=1` 8/8 활성을 직접 검증 가능. B-7 미머지 상태로 본 task만 진행해도 6/8 활성(B-7 차단 2개는 skip 유지)으로 검증 가능.

## 1. 증상

| 모드 | 결과 |
|---|---|
| `npm run test:e2e` (헤드풀, default) | 6 passed, 2 skipped, 0 failed (8.9s) ✅ |
| `HEADLESS=1 npm run test:e2e` (headless='new') | 0 passed, 6 failed, 2 skipped ❌ |

failure 패턴 — 6 시나리오 전부 동일:
```
TimeoutError: browserContext.waitForEvent: Timeout 15000ms exceeded while waiting for event "serviceworker"
   at ../helpers/launch.js:29
```

`tests/e2e/helpers/launch.js:29`:
```js
let sw = ctx.serviceWorkers()[0];
if (!sw) {
  sw = await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
}
```

즉 launch persistent context 직후 15초 안에 MV3 service worker가 등록되지 않음.

## 2. 원인 후보

1. **chromium headless='new' 모드의 MV3 SW lazy-start**
   - headless='new'는 MV3 service worker를 trigger 이벤트(메시지·알람 등) 없이 자동 시작 안 할 수 있음
   - 헤드풀에서는 일반적으로 첫 페이지 navigation이나 idle hook으로 자동 시작
   - Playwright `--load-extension` + headless='new' 조합의 알려진 이슈 가능성 (외부 검색 필요)

2. **첫 page navigation 부재**
   - `launch()` 함수가 ctx 생성 직후 SW 대기 — 빈 about:blank 페이지조차 navigate 안 함
   - 헤드풀은 chrome 자체가 새 탭(NTP)을 열어서 SW가 부수적으로 trigger

3. **timeout 보수적**
   - 15초가 일부 환경에선 부족. 30~60s가 표준

## 3. 수정 옵션 (단순 → 복잡)

### A. timeout 상향 (15s → 60s)
한 줄. 근본 원인이 단순히 시간 부족이면 해결. 시간이 충분해도 fail이면 다른 옵션 필요.

```js
sw = await ctx.waitForEvent("serviceworker", { timeout: 60_000 });
```

### B. ctx 생성 후 about:blank navigate (Recommended 1차 시도)
SW 등록을 trigger하기 위한 가장 가벼운 방법.

```js
const ctx = await chromium.launchPersistentContext(...);
let sw = ctx.serviceWorkers()[0];
if (!sw) {
  // headless='new'에서 MV3 SW lazy-start 트리거
  const page = await ctx.newPage();
  await page.goto("about:blank");
  sw = await ctx.waitForEvent("serviceworker", { timeout: 30_000 });
  await page.close();
}
```

### C. chrome://extensions navigate
`page.goto("chrome://extensions")` 가 확장 SW를 명시적으로 fire. 단 chrome:// URL은 일부 Playwright 설정에서 차단 가능.

### D. extension SW URL 직접 navigate
`page.goto(`chrome-extension://${extId}/_generated_background_page.html`)` — extId를 미리 알아야 해 chicken-and-egg.

### E. launch args 보강
- `--enable-features=ServiceWorkerOnUI` 등 chromium flag 시도
- `--disable-features=DisableLoadExtensionCommandLineSwitch`
- 단점: 외부 의존성, chromium 버전마다 다름

### F. headless mode 자체를 'old'로 (`headless: "shell"` 또는 `false` 강제)
가장 안전하나 CI 환경 의존성. CLAUDE.md에 명시된 "HEADLESS=1 = CI/백그라운드"의 의도와 충돌.

## 4. 권장 진행

1. 옵션 B (about:blank navigate)를 먼저 적용 → `HEADLESS=1 npm run test:e2e` 재시도
2. 여전히 fail이면 옵션 A(timeout 상향) 추가
3. 그래도 fail이면 옵션 E(launch args) 시도 또는 옵션 F(headless='shell')로 fallback
4. 옵션 별 재시도는 Bash로 5분 이내 검증 가능

## 5. 검증

### B-7과의 의존
- B-7 미해소 상태에서 본 task 진행 가능: HEADLESS=1 동작만 검증, 두 skip 시나리오는 그대로
- B-7 해소 후엔 `HEADLESS=1 npm run test:e2e` → 8/8 pass 목표

### 머지 전
1. `npm run test:e2e` (헤드풀) → 회귀 없음 (6/8 또는 8/8 pass 유지)
2. `HEADLESS=1 npm run test:e2e` → 6/8 pass (B-7 미해소 가정) 또는 8/8 (해소 후)
3. CI workflow `.github/workflows/test.yml` HEADLESS=1로 동작하는지 확인 (필요 시 workflow 갱신)

### 커밋 분할 권장
- `fix(e2e): trigger MV3 service worker registration via about:blank navigate for headless mode`
- (필요 시) `chore(e2e): widen serviceworker registration timeout to 30s`
- (필요 시) `chore(e2e): pin launch args for chromium headless extension support`
- `docs: mark B-8 resolved in NEXT-SESSION`

## 6. 다음 세션 진입 프롬프트

```
SOMA Schedule Helper 작업 디렉토리(/Users/wondong-gyu/Desktop/agents/soma-schedule-helper)에서 B-8 E2E HEADLESS=1 모드 service worker timeout fix 진입.

배경:
- npm run test:e2e (헤드풀)는 6/8 pass 정상
- HEADLESS=1 npm run test:e2e는 6/6 fail (모두 helpers/launch.js:29 serviceworker waitForEvent 15s timeout)
- 사용자 환경에선 spec 12가 정상 동작했던 인프라가 Claude Bash 환경에선 fail
- CI workflow(.github/workflows/test.yml)도 HEADLESS=1 가정이라 정합성 위해 fix 필요

상세는 docs/agent-troubleshooting/task-b8-e2e-headless.md §3 옵션 비교 + §4 권장 진행 그대로:
1. fix/e2e-headless-sw-timeout 브랜치 컷 (main에서)
2. 옵션 B 먼저 적용: helpers/launch.js에 ctx.newPage().goto("about:blank") 한 단계 추가하고 timeout 30s로 상향
3. HEADLESS=1 npm run test:e2e 재시도 → pass 여부 확인
4. fail 지속 시 §3 옵션 A·E·F 순으로 시도
5. 헤드풀(npm run test:e2e)도 회귀 없는지 재확인
6. CI workflow 점검 (필요 시 갱신)
7. 커밋 분할(작업 문서 §5 참조), main fast-forward 머지
8. NEXT-SESSION §4 B-8 ✅ 해소 표기, §9 변경 이력 갱신

이 task는 B-7과 독립. B-7 머지 전이면 6/8 pass가 목표, 머지 후면 8/8 pass.

가능하면 코드 변경 전 외부 자료(Playwright + chromium MV3 + headless='new' 알려진 이슈)를 WebSearch 1회로 빠르게 조회 권장 — 본 환경 외에서 같은 이슈가 보고됐는지.
```

## 7. 관련 링크

- spec 12: `docs/specs/12-test-automation.md`
- launch helper: `tests/e2e/helpers/launch.js:29`
- playwright config: `tests/e2e/playwright.config.js`
- CI workflow: `.github/workflows/test.yml`
- 본 task와 묶일 선행: B-7 (spec 01 회귀) — 두 task는 독립 진행 가능, 단 둘 다 머지돼야 `HEADLESS=1` 8/8 활성
