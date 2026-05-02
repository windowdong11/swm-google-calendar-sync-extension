# 다음 세션 인계 — SOMA Schedule Helper 신규 기능

이 문서는 **새 세션이 cold start로 픽업할 수 있게** 현재까지 정리된 결정·미결정·차단 사항을 한 곳에 모았다. 다음 세션을 시작하면 이 문서부터 읽고 → 작업 라운드 선택 → 해당 spec 본문으로 들어간다.

---

## 0. 오리엔테이션 (이 순서로 읽기)

1. `docs/agent-guide.md` — 기존 확장의 코드 구조·동작 (변하지 않는 토대)
2. `docs/specs/README.md` — 브랜치 전략·스펙 템플릿·Phase 인덱스
3. **이 문서** (`NEXT-SESSION.md`) — 현재 미결정·차단·다음 작업
4. 작업 대상 spec 본문 (`docs/specs/NN-*.md`)

---

## 1. 직전 세션에서 한 일 (요약)

### 2026-04-30 ~ 2026-05-02 Round 1.5 — spec 12 자동화 인프라 + 라이브 회귀 4건 fix + B-8 해소

**E2E 자동 테스트 인프라 + 스펙 01/05 회귀 2건 + B-8 headless 모드 timeout 해소**. 6개 작업 모두 main 머지 완료:

1. **B-7 fix** (`fix/spec-01-regressions`, 3 commits): spec 01 회귀 2건 — GET_CALENDAR_EVENTS 응답 형식 평면화 처리 + manifest.json `tabs` permission. e2e B-1·B-2 시나리오 활성화. 단위 117/117 pass.
2. **B-9 fix** (`fix/spec-05-list-url-menuno`, 1 commit): list.do URL `?menuNo=200046` 누락 회귀.
3. **B-10 fix** (`fix/spec-05-pagination`, 2 commits): 폴링이 첫 페이지만 가져오던 회귀. `buildListUrl({scdate, ecdate, pageIndex})` 추가, `pageIndex=1` 순회, 빈 페이지/MAX_PAGES cap 시 stop.
4. **폴링 범위 확장** (`fix/spec-05-range-all-future`, 2 commits): rangeDays 30→1825(5년), MAX_PAGES 10→30. 사실상 "전체 미래 일정".
5. **e2e 커버리지 보강** (`test/e2e-polling-coverage`, 2 commits): c-polling.spec.js에 B-9·B-10 회귀 자동 검증. fixture 다중 페이지 mock. AUTHORING.md "fixture-first, 라이브 최후 수단" 룰 추가.
6. **B-8 fix** (`fix/spec-12-headless`, 2 commits): HEADLESS=1 service worker timeout 해소. headless:false + `--headless=new` arg + about:blank navigate + serviceWorkers() polling. HEADLESS=1 e2e 12/12 pass.

**토큰 효율 검증** (격리 룰 실제 검증, 5회 연속 사고 0): B-7 ~128k (Agent 충돌 1회, +33k 손실). 나머지 5건은 각각 ~60~89k, 모두 사고 0 — 같은 working tree에서 **다른 파일 영역**으로 분리 + 변경 직후 **즉시 git add** 강제로 worktree 없이도 안전성 확보.

### 2026-04-29 Round 1 머지 완료 (B-5 fix + spec 01)

**B-5 회귀 fix** — `fix/content-scripts-test-regression` 1 커밋(b812215) → main. fixture 강의 시각 영구 미래화. `npm test` 79/79.

**spec 01 calendar-view (11 commits)** — `feature/01-calendar-view` → main:
- `4a2b571` docs(specs): redesign spec 01
- `6c71970` feat(calendar): add calendar.html shell + chrome.action.onClicked open handler
- `30f6ee2` feat(calendar): render Google Calendar events into week/month grid
- `2bcb5ab` test(calendar): cover lecture-filter and calendar-view edge cases
- `b20772c` feat(calendar): side panel filters lectureSnapshot, mock fixture, agent-guide updated
- `60840f2` fix(service-worker): guard chrome.action.onClicked listener for vm test environment
- `f00b11c` refactor(calendar): replace ESM exports with CJS for browser+test compatibility
- `146e5fa` docs(specs): polish wording
- `569475a` fix(calendar): refresh side panel on navigate, share view-hour constants, guard chrome.windows.update
- `81a34bb` feat(filter): expose plug-in slot for future spec 02/03/04 filters
- `a271705` docs: list calendar and polling messages in agent-guide §7

**핵심 결과물**:
- 캘린더 본체 = Google Calendar 이벤트만(`GET_CALENDAR_EVENTS` 재사용, 신규 메시지 없음). SoMA 신청 특강은 OAuth가 이미 삽입.
- 사이드 패널 = lectureSnapshot 미신청 특강(`endAt < now` 제외 + 빈 영역 드래그 시 완전 포함 필터).
- `lecture-filter.js` plug-in 슬롯(`additionalFilters`)이 spec 02·03·04 진입 시 시그니처 변경 없이 확장 가능.
- 신규: `src/calendar/{html,css,calendar.js,calendar-view.js,lecture-filter.js}`, `tests/unit/{calendar-view,lecture-filter}.test.js`, `mock/calendar.html`.
- 수정: `manifest.json` (action·default_title), `service-worker.js` (chrome.action.onClicked 핸들러), `agent-guide.md` (§3·§7).
- 29 신규 테스트, `npm test` 108/108 pass.

**라이브 환경 미검증** (사용자 직접 처리 권장): unpacked Chrome 확장에서 (a) 아이콘 클릭 → 새 탭, (b) Google Calendar 이벤트 시간축 표시, (c) 빈 영역 드래그 → 사이드 패널 필터, (d) 카드 클릭 → SoMA 상세 진입 직접 확인. spec 05 폴링 라이브 검증(B-3)과 같은 시점에 처리 권장.

### 2026-04-29 Round 0 머지 완료

**spec 05 (background polling) 핵심 경로 MVP**
- `feature/05-background-polling` 7 커밋 → main 머지
- `chrome.alarms` 10분 주기 + offscreen document로 DOMParser 위임 + `lectureSnapshot`/`pollingState` storage + 인증 만료 감지 + backoff(1m→5m→15m→60m→max-retry)
- 신규: `src/background/{polling,swm-fetch,offscreen}.{js,html}`, `tests/unit/{polling,swm-fetch}.test.js`
- 수정: `manifest.json` (alarms·offscreen permission), `src/background/service-worker.js` (alarm 핸들러 + 4개 메시지 타입)
- 55 테스트 추가, 100% pass

**비식별화 도구**
- `chore/anonymize-fixtures-tooling` 7 커밋 → main 머지
- `npm run refresh:fixtures` — 사용자가 `.agent/raw/`에 raw HTML 저장 → 자동 마스킹 → `tests/fixtures/site-current/` 또는 `mock/` 갱신
- 한글 이름·7+자리 숫자·이메일·전화·csrfToken UUID 마스킹, placeholder sentinel로 idempotent 보장
- 24 테스트 추가, 실 fixture 3개에 대해 idempotent + fixturePreserved 검증 통과
- 신규: `scripts/lib/anonymize.mjs`, `scripts/anonymize-fixtures.mjs`, `docs/agent-troubleshooting/refresh-fixtures.md`, `tests/unit/anonymize-fixtures.test.js`
- 수정: `package.json`, `.gitignore`

### 직전 세션(2026-04-28)에서 한 일

- 기존 dirty 상태를 의미별 4커밋으로 분할
- spec 디렉토리(`docs/specs/`) 골격 + 메타 README + spec 01~10 draft 작성
- 빈 `swm-schedule-alert/` 디렉토리 폐기

### 현재 상태
- spec 05: `Status: shipped` (옵션 UI·라이브 URL은 후속 PR)
- spec 01: `Status: shipped`. 단 spec 12 인프라가 라이브 회귀 2건 자동 발견 (§4 B-7 참조)
- spec 02·03·04·06·08·09·10·11: `Status: draft`
- spec 07: `Status: deprecated` (책임 spec 08에 흡수)
- spec 12: `Status: shipped` (인프라 + 6/8 시나리오 활성화. B-1 dedupe·B-2 events는 spec 01 회귀로 차단, fix 후 활성화)

---

## 2. 사용자 결정 대기 (`@user`) — 묶음별

각 결정의 차단성 분류:
- 🛑 **차단**: 해당 spec 코딩 시작 전 필수
- ⏸️ **부분 차단**: 핵심 경로는 진입 가능, 특정 단계에서만 막힘
- ✅ **비차단**: 코드 작성 중·후반에 결정해도 무방 (상수/플래그 1라인)

결정 완료 항목은 spec 본문에 반영되어 있고, 본 문서에서는 제거됨. 아래 목록이 남은 전부.

### 묶음 A — 결정 완료 (2026-04-29)

[결정 완료 항목 §2 끝부분 참조] 6개 + spec 07 폐기까지 일괄 결정.

### 묶음 B — ✅ 결정 완료 (2026-04-30)

- [x] **U-08-1**: `상세로 이동` + `읽음` 2버튼 (Chrome notification 한도 + YAGNI). spec 08 §3·§12 반영.
- [x] **U-09-1**: 멘토 칩 옆 + 그룹 헤더(spec 03) **둘 다**. action 우선. 구현 시 YAGNI 단계 도입(헤더 → 칩) 권장. spec 09 §3·§12 반영.
- [x] **U-10-2**: 충돌 상태 특강 등록 시 **경고만, 등록 허용**. 파워 유저 자율성. spec 10 §12 반영.

### 묶음 C — ✅ 결정 완료 (2026-04-30)

- [x] **U-02-2**: 카테고리 매핑 편집 UI는 **옵션 페이지**. 편집 빈도 낮음 전제. spec 02 §12 반영.
- [x] **U-04-2**: 텍스트 검색은 **별도 spec 11로 분리**. CLAUDE.md "한 브랜치 = 한 spec" 규약. spec 04 §3·§12 반영, spec 11 stub 신설.

### 묶음 D — B-1 일부 해소 (2026-04-29, site-current fixture 분석)

`tests/fixtures/site-current/list.html` 17KB 분석 결과 다음 확정:

- [x] **U-02-1** 카테고리 컬럼은 list.do에 **노출되지 않음**. 컬럼 헤더: NO·제목·접수기간·진행날짜·모집인원·개설승인·상태·작성자·등록일. spec 02는 상세 페이지 의존 또는 별도 매핑 UI 필요.
- [x] **U-03-1** 멘토명 = "작성자" 컬럼 (마지막에서 두 번째). list.do 행에서 직접 추출 가능.
- [ ] ✅ **U-03-2** 멘토명 표기에 소속 포함 정도 — 추천: 표시는 원문, 매칭은 정규화 키 (spec 03 코드 진입 시점에 결정)

### 묶음 E — spec 05 옵션 UI 후속 PR (2개, ⏸️ 부분 차단)

spec 05 핵심 경로는 머지됨. 옵션 UI 후속 PR 작성 시 결정.

- [ ] **U-05-1** 폴링 활성 안내·동의 — 추천: 옵션 페이지 단순 토글 + 토글 옆 트래픽·배터리 안내 문구
- [ ] **U-05-2** 인증 만료 시 처리 — 추천: 사용자 안내만 (보이지 않는 redirect 추적은 위험)

### 결정 완료 항목 (참고)

- [x] **Spec 05 머지 (2026-04-29)** — D-05-1 chrome.offscreen + DOMParser, D-05-3 코드 명칭 `parseListLectures` 사용. 후속 PR로 분리: 옵션 UI(묶음 E), 라이브 URL 쿼리스트링(D-05-2 — B-1 raw 캡처 후)
- [x] **Spec 01 — 캘린더 뷰** (2026-04-29 의도 전환):
  - U-01-1 새 탭 전용 페이지 진입, U-01-2 시간축 08:00~24:00 (유지)
  - **D-3 데이터 소스 정의 변경**: 본래 "lectureSnapshot의 모든 SoMA 특강을 그리드에 직접 렌더" → 변경 후 "**캘린더 본체 = Google Calendar 이벤트만** (`GET_CALENDAR_EVENTS` 메시지 재사용, SoMA 신청 특강은 OAuth가 이미 Calendar에 삽입), **사이드 패널 = lectureSnapshot 기반 미신청 특강**". 신규 메시지 없음.
  - **T-01 해소**: 셀 충돌 패널은 호버/클릭 둘 다 채택 안 함. 대신 **빈 영역 드래그 → 사이드 패널 활성 → 드래그 범위에 완전 포함되는 lecture만 필터** UX. 기본 필터는 `endAt < now` 제외.
  - 사이드 패널 필터 슬롯 인터페이스만 마련, spec 02·03·04 필터는 추후 plug-in
- [x] **2026-04-29 묶음 A + spec 07 폐기**
  - **spec 07 폐기**: 시간/장소/메타 변경 알림 기능 자체 제외. chrome.notifications 발송 책임은 spec 08이 흡수
  - **U-04-1**: `almostFull` = 잔여 정확히 1자리. 옵션화 X (사용 후 재검토)
  - **U-06-1**: spec 07 폐기로 자동 무효화 (meta-changed 이벤트도 제거)
  - **U-07-1**: spec 07 폐기로 자동 무효화
  - **U-07-2**: 자리 알림 본문에 잔여석 수 표시
  - **U-08-2**: 알림 큐 보존 기간 = 3일
  - **U-09-2 → 의미 전환**: 1차 출시는 멘토 카테고리 세분화 X. 단 spec 09의 알림 정책이 "별표 멘토만 발송"에서 "전역 신규 특강 알림 + 별표 멘토 필터링 UI"로 전환. 동일 제목 특강은 한 알림에 시간만 다중 표기로 그룹화
  - **U-10-1**: `seat-closed` 알림 발송 안 함

---

## 3. 명확화 필요 (`@tbd`)

세션 진행 중 코드 작성 시점에 결정 가능한 것들. 사용자 결정이 꼭 필요하진 않지만 결정 전 코딩 진입 시 위험.

| ID | 위치 | 내용 | 예상 결정 시점 |
|---|---|---|---|
| ~~T-01~~ | spec 01 | ✅ 해소(2026-04-29): 셀 충돌 패널 폐기, 빈 영역 드래그 → 사이드 패널 완전 포함 필터 | — |
| T-01a | spec 01 | Google Calendar fetch 실패 시 fallback (단순 안내 vs 자동 재시도) | calendar 코딩 시 |
| T-01b | spec 01 | 드래그 영역이 시간축 외(02:00~05:00)일 때 처리 — clamp 권장 | calendar 코딩 시 |
| T-02 | spec 02 | 와일드카드를 정규식까지 허용할지 | 매핑 UI 설계 시 |
| T-03 | spec 03 | 동명이인 처리 정규화 알고리즘 | 멘토 정규화 함수 작성 시 |
| T-04 | spec 04 | `cancelled` 신청 상태 판정 방법 (접수내역 의존) | 필터 엔진 작성 시 |
| T-05 | spec 05 | content script vs 폴링 결과 충돌 시 우선순위 | 폴링 + content 동시 동작 단계 |
| T-06 | spec 06 | 시리즈 사라짐·재등장 보정 (현재는 removed/added 페어로 노출) | diff 함수 작성 시 |
| T-08 | spec 08 | Windows 포커스 어시스트·DND 안내 문구 / 자리 알림과 신규 특강 알림 시각적 묶음 | 팝업·옵션 UI 작성 시 |
| T-09 | spec 09 | 제목 정규화 알고리즘 (공백·괄호·회차번호 제거 정도) | 그룹화 함수 작성 시 |
| T-10 | spec 10 | 자동 제거 시 큐 항목도 같이 정리할지 | watch 모듈 작성 시 |

---

## 4. 차단 항목 (사용자가 직접 작업 필요)

코딩으로 풀 수 없고 **사용자 또는 사용자 환경에서 정보 수집**이 필요한 것.

### B-1 SWM 페이지 raw 캡처 — 일부 해소 (2026-04-29)

- **현재 상태**:
  - `tests/fixtures/site-current/list.html`(17KB) 분석으로 **컬럼 구조 확정**: NO·제목·접수기간·진행날짜·모집인원·개설승인·상태·작성자·등록일
  - 카테고리 컬럼 없음(spec 02는 상세 의존), 멘토명=작성자(spec 03), 정원=모집인원(spec 04·06·10) 노출 ✓
  - **list.do URL 쿼리스트링 확정**(2026-04-30): `?menuNo=200046` 필수. 누락 시 page-not-found 리다이렉트.
- **남은 부분**: 신청수(applyCnt) 노출 여부 — list.do에 별도 컬럼 없음. 상세 페이지에서만 보일 가능성 (B-2와 묶임)
- **워크플로우 정착**: 사용자가 더 새로운 raw 캡처가 필요하면 `.agent/raw/`에 저장 → `npm run refresh:fixtures` 실행 → `tests/fixtures/site-current/` 또는 `mock/` 갱신. `docs/agent-troubleshooting/refresh-fixtures.md` 가이드 참조.

### B-2 정원·신청수 정보 노출 여부 — 부분 확인 (2026-04-29)

- **확정**: 정원(모집인원) = list.do 컬럼에 노출 ✓
- **미확정**: 신청수(applyCnt) — list.do에는 컬럼 없음. 상세 페이지(`view.do`)에 `parseDetailLectureInfo`로 추출 (parsers.js L327 시그니처에 `appCnt`/`applyCnt` 보유) → 폴링이 각 상세 페이지를 추가 fetch 해야 함
- **결정 필요**: spec 05·06에 "상세 페이지 추가 폴링 단계" 보강. 비용 평가(특강 N개 × 상세 fetch) — Round 2 spec 06 진입 시 결정
- **자동 트리거**: spec 06 진입 시점에 `researcher` 에이전트 위임. **prompt 초안** (필요 시 그대로 launch):
  ```
  researcher (sonnet) — SOMA 폴링 신청수(applyCnt) 추가 fetch 비용 평가.
  - 데이터: tests/fixtures/site-current/list.html에서 평균 list.do 응답 특강 수, 평균 행 크기. tests/fixtures/site-current/view.html(있다면)에서 상세 응답 크기. polling.js의 폴링 빈도(default 10분).
  - 출력: (a) 일일 트래픽 추정(특강 수 × 폴링 빈도 × 상세 응답 크기), (b) service-worker CPU 영향, (c) 부분 폴링 전략 비교 — 신규/잔여 변동 가능 항목만 상세 fetch vs 전체 매 사이클. 각 전략의 trade-off + 추천. 800자 이내.
  ```

### B-3 SWM 백그라운드 fetch 인증 검증 — 라이브 보류

- **현재 상태**: spec 05 머지됨. fixture 기반 단위 테스트로 회로 검증 완료 (55/55 pass).
- **미완료**: 라이브 환경(사용자 Chrome 확장 service worker)에서 실제 swmaestro 세션 쿠키 자동 동반 여부 검증
- **외부 검증 한계**: Python urllib 2단계 form 로그인 시도 시 list.do가 `main.do`로 redirect 또는 913자 빈 응답 반환 — SoMA가 user-agent·세션 type별 다른 응답을 주거나 SPA·동적 렌더링. 외부 fetch로는 라이브 검증 불가능.
- **검증 방법**: 사용자 unpacked 로드 → Chrome service worker 콘솔에서 `chrome.storage.sync.set({pollingSettings:{enabled:true,intervalMinutes:10,rangeDays:30}}); chrome.runtime.sendMessage({type:'POLLING_TRIGGER_NOW'})` 실행 → `chrome.storage.local.get('lectureSnapshot')`에 `lectures.length > 0` 확인. 후속 옵션 UI 작성 후 한 번 검증.

### B-4 (선택) Chrome OS 알림 권한 동작 확인

- spec 08 작성·테스트 단계에서 사용자 환경(macOS 알림 센터 설정)에서 실제로 표시되는지 확인.

---

## 5. 작업 라운드 (병렬 트랙)

병렬의 핵심 두 축:
- **종축(시간)**: spec 코드 의존 그래프
- **횡축(병렬)**: Claude 코딩 트랙 ∥ 사용자 결정/캡처 트랙

### 5.1 의존성 그래프

```
05 (polling) ────┬── 01 (calendar-view)        ← Round 0, 1
(B-3 검증 의존)   │
                 ├── 06 (diff) ── 08 (queue+notify)
                 │                  │
                 │                  ├── 09 (new-lecture-notifier)
                 │                  └── 10 (lecture-watch, B-2 의존)

B-1 ─── 02 (category) ──┐
   └─── 03 (mentor) ────┼── 04 (filter)
                        └── (parser 확장 공유)

[폐기] 07 (Chrome notification) — 책임은 08에 흡수
```

**spec ↔ spec 의존 핵심**:
- 01 ← 05 (lectureSnapshot 소비)
- 06 → 08 (한 흐름)
- 09 ← 03 + 06 + 08
- 10 ← 06 + 08 + B-2

### 5.2 Round 0 — ✅ 완료 (2026-04-29)

| 트랙 | 작업 | 결과 |
|---|---|---|
| Claude | spec 05 핵심 경로 MVP | ✅ 머지됨 (7 커밋) |
| Claude | 비식별화 도구 (`npm run refresh:fixtures`) | ✅ 머지됨 (7 커밋) |
| 자동 분석 | B-1 부분 해소 (site-current fixture) | ✅ U-02-1·U-03-1 확정, B-2 정원 노출 확정 |

### 5.3 Round 1 — ✅ 완료 (2026-04-29)

| 트랙 | 작업 | 결과 |
|---|---|---|
| Claude | B-5 회귀 fix (`fix/content-scripts-test-regression`) | ✅ 머지(b812215). 79/79 pass |
| Claude | spec 01 본문 재작성 + 코딩 (`feature/01-calendar-view`) | ✅ 11 commits 머지. spec 01 `Status: shipped`. 108/108 pass |
| 사용자 | spec 01 라이브 환경 수동 검증 | 🟡 미수행 (B-3 검증과 같은 시점 권장) |
| 사용자 | **묶음 B** 알림 정책 3개 + **묶음 C** spec 진입 2개 결정 | 🟡 미수행 (Round 2 진입 전 필수) |

### 5.4 Round 2 — 두 트랙 병렬 (선결조건 모두 해소)

```
Track A (service-worker 흐름):     Track B (parsers.js 흐름):
06 (diff) → 08 (queue+notify)      02 (category) → 03 (mentor) → 04 (filter)
```

| 트랙 | spec | 코드 영역 | 사용자 결정 |
|---|---|---|---|
| A | 06 → 08 | `service-worker.js`, `popup.js` | ✅ Round 1에서 처리됨 |
| B | 02 → 03 → 04 | `parsers.js`, 옵션 페이지 | ✅ Round 1에서 처리됨 |

**진행 옵션**:
- **(권장) Track A 먼저, B 나중** — 06·08은 한 흐름이라 한 세션에 묶어 작업. 머지 후 02·03·04 진입.
- **(고급) worktree 진짜 병렬** — `isolation: "worktree"`로 두 Agent 동시 위임. parsers.js의 02·03 충돌 가능 → Track B 안에서는 02 → 03 순차.

### 5.5 Round 3 — 마무리 (Phase 3)

| spec | 의존 | 비고 |
|---|---|---|
| **09** (신규 특강 알림) | 03 + 06 + 08 머지 | Track A·B 둘 다 끝나야 |
| **10** (특강 watch) | 06 + 08 + **B-2 결과** | B-2가 "상세 폴링 필요"로 나오면 spec 05·06 보강 후 진입 |

09·10은 코드 영역 다름(09=parsers/popup/그룹화 매처, 10=service-worker watch 모듈) → **동시 진행** 가능.

### 5.6 타임라인

```
Round 0 ┃ ✅ 완료 — spec 05 + 비식별화 도구 머지 (2026-04-29)        ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 ┃ [Claude: spec 01] + (선택) B-5 회귀 fix                    ┃ ← 다음 진입
        ┃ [User: 묶음B(3) + 묶음C(2)]                                ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1.5 ┃ ✅ 완료 — B-7/9/10 라이브 회귀 4건 fix + e2e 보강 + B-8 헤드리스 모드 (2026-05-02)
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 2 ┃ [Claude: 06→08]      →  [Claude: 02→03→04]                 ┃
        ┃ (B-2 신청수 결정 — 상세 폴링 도입 여부)                    ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 3 ┃ [Claude: 09 ∥ 10]    (동시 진행 가능)                      ┃
        ┃ + spec 05 옵션 UI 후속 PR (묶음 E 결정 후)                 ┃
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5.7 라이브 검증 최후 수단

자동 e2e (spec 12) 시나리오·fixture로 회귀 검증을 우선. 라이브 검증은 fixture 보강 불가능한 경우(인증·OAuth·실제 도메인 응답 형식 미공개)에만 사용. 이번 라운드에서 B-9·B-10·range 확장이 라이브로만 잡힌 사고를 e2e fixture 보강(`test/e2e-polling-coverage`)으로 메움.

### 5.8 병렬 효율 핵심 룰

1. **결정은 묶어서**: 묶음 B(U-08-1·U-09-1·U-10-2)를 따로 결정하면 spec 08/09/10 진입할 때마다 멈춤.
2. **Track A와 B의 분리**: spec 05 머지됐으니 두 트랙(서비스워커 vs parsers) 독립적으로 진행 가능.
3. **Round 2 worktree 병렬화는 옵션** — 단일 Claude 세션이라면 Track A 먼저 권장.

### 5.9 함정 포인트

- **B-2 신청수 폴링 비용**: list.do에는 신청수 컬럼 없음 → 특강 N개당 상세 fetch 1회 추가. spec 06·10 진입 시 비용 평가 + 부분 폴링 전략(신청수 변동 가능성 높은 항목만) 검토.
- **parsers.js 충돌**: Track B 안 02·03 진짜 병렬 시 같은 파일 만져 rebase 비용. 02 → 03 순차가 안전.
- **spec 05의 묶음 E**: 옵션 UI 후속 PR 시점에만 필요. Round 1·2 진행 중엔 default `enabled:false`라 실 사용은 사용자 직접 storage.set으로만 가능.
- **spec 05 라이브 smoke test 미완**: 후속 옵션 UI PR 작성 시 사용자 unpacked 로드로 실제 검증 필요. 그 전엔 fixture 단위 테스트만 통과 상태.

---

## 6. 권장 다음 세션 시작 시퀀스

진입 지점: **Round 2 — spec 06·08 (Track A) 또는 spec 02·03·04 (Track B)**. 선결조건 모두 해소됨.

### 권장 순서

1. **세션 시작** — 메인이 `git log --oneline main -5`로 Round 1.5 머지 확인. 본 NEXT-SESSION.md 읽고 Round 2 진입.

2. **Round 2 — Track A 우선 (권장)**: spec 06 → spec 08 한 흐름.
   - `feature/06-lecture-snapshot-diff` → `code-delegate` 위임
   - 머지 후 `feature/08-notification-queue` → `code-delegate` 위임 (spec 07 폐기, 책임 흡수)

3. **Round 2 — Track B (Track A 머지 후 또는 worktree 병렬)**: spec 02 → spec 03 → spec 04. parsers.js 충돌 위험으로 02·03 순차 권장.
   - B-2 신청수 폴링 비용 결정은 spec 06 진입 시점에 (researcher 백그라운드 위임 가능).

4. **Round 3 — Phase 3**: spec 09 ∥ spec 10 (코드 영역 다름 → 동시 진행). spec 05 옵션 UI 후속 PR도 이때 묶어 처리.

### 백로그 (낮은 우선순위)

spec 01·05 라이브 smoke test (unpacked 확장 B-3 검증, 30분 내) — 단위 e2e 모두 pass 상태이므로 urgent 아님. spec 08·09·10 진입 후 여유 시 처리.

---

## 7. 작업 모드 (운영 패턴)

다음 세션은 **메인 세션 = 오케스트레이터** 패턴으로 진행. 코드 본문은 메인이 직접 읽거나 쓰지 않고 서브에이전트에 위임.

### 7.1 권장 도구 매핑

- **`/code-delegate`** — coder + code-reviewer 순차 위임. spec 작업 기본형.
- **`Agent(Explore)`** — 코드 위치 찾기 (parsers.js, service-worker.js 안쪽 구조 파악).
- **`isolation: "worktree"`** — Round 2 Track A·B 동시 위임 시 필수. 충돌 없는 진짜 병렬.
- **`run_in_background: true`** — Track B 백그라운드 위임 + 메인은 Track A 진행.
- **`claude -p`** — B-3 인증 검증처럼 단발 fetch 작업 (메인 OAuth context 격리).

### 7.2 토큰 절약 & 안전 룰

#### 7.2.1 모델 매핑 (메인 strategy)

| 모델 | 비용 비율 | 적합 작업 |
|---|---|---|
| **Haiku** | 1x | 단순 fix(1~3줄), 문서 갱신, 위치 검색, 커밋 메시지, 메커니컬 rename |
| **Sonnet** | ~3x | spec 본문 코딩, 코드 리뷰, 다중 파일 변경, 일반 디버깅, e2e 시나리오 작성 |
| **Opus** | ~15x | 아키텍처 결정, 트레이드오프 분석, 복잡한 디버깅, 갈등하는 제약 다루기 |

**전략**: 메인 = 가벼운 오케스트레이터(Haiku 유지), 코딩은 Sonnet 위임, Opus는 1회성 의사결정 시점에만.

#### 7.2.2 격리 룰 (Round 1.5 검증 완료)

**근거 데이터 (5회 연속 사고 0)**:

| 라운드 | 토큰 소비 | 사고 | 적용 격리 룰 | 비고 |
|---|---|---|---|---|
| B-7 | ~128k | 1회 | 미적용 | Agent 충돌(+33k 손실) |
| B-9 | ~60k | 0 | 적용 시작 | 격리 룰 초기 도입 |
| B-10 | ~72k | 0 | 적용 | 격리 룰 |
| range | ~67k | 0 | 적용 | 격리 룰 |
| e2e cover | ~85k | 0 | 적용 | 격리 룰 |
| B-8 | ~89k | 0 | 적용 | 격리 룰 |

**격리 룰 구성**:
1. **파일 영역 분리**: 같은 working tree에서 두 Agent 병렬 호출 시 다른 파일 영역으로 분리 (예: src+tests vs docs)
2. **변경 직후 즉시 git add**: 수정 완료 후 바로 해당 영역을 staging area에 고정
3. **"다른 영역 절대 건드리지 마" 프롬프트 명시**: Agent 시스템 메시지에 분리 경계 명시

**효과**: worktree isolation 없이도 토큰 효율 + 변경 보호 양립.

#### 7.2.3 메인 워크플로우 (사고 회피 패턴)

- **Bash grep으로 위치만 추출** (`grep -rn "패턴" src/`) → Agent에 정확한 파일·라인 명시 위임. 메인이 대상 파일 통째로 Read 금지.
- **Agent 응답 길이 제약 명시**: "200~300자 제약", "변경 파일·라인·테스트 결과만"
- **사용자 paste > 메인 추측**: 라이브 환경 정보는 사용자 paste로만 수집 (메인이 fetch X). 단 fixture로 mock 가능하면 e2e 우선.
- **분할 commit 메인이 처리**: Agent는 변경만, 메인이 `git status` 보고 영역별 분할 commit.

#### 7.2.4 Round 2 진입 시 권장 구성

| 트랙 | spec | Agent 역할 | 분리 전략 |
|---|---|---|---|
| **Track A** | 06 → 08 | Sonnet coder + Sonnet code-reviewer | 순차 진행 (한 세션에 묶음) |
| **Track B** | 02 → 03 → 04 | Sonnet coder | 순차 진행 (parsers.js 충돌 회피) |
| **병렬 옵션** | A ∥ B | worktree isolation 또는 격리 룰 적용 | 같은 working tree면 §7.2.2 격리 룰 필수 |

**선택지**:
- **(권장 Level 1) 순차**: Track A 완료 머지 → Track B 시작
- **(권장 Level 2) 격리 룰로 병렬**: 파일 영역 분리(A=service-worker.js/popup.js, B=parsers.js/옵션페이지) + 변경 직후 즉시 git add
- **(고급) worktree 진짜 병렬**: `isolation: "worktree"` flag로 두 Agent 동시 독립 worktree에서 작업

### 7.3 안티패턴 (피할 것)

- ❌ 메인에서 `Read parsers.js` 후 직접 `Edit` — 200줄이 메인에 흡수됨
- ❌ Agent를 한 메시지에 1개씩 N번 호출 — 직렬화. 병렬은 단일 메시지 다중 호출 필수
- ❌ Agent 보고서를 그대로 사용자에게 relay — 한 번 압축 (CLAUDE.md "끝 요약 1-2문장")
- ❌ 자동화 hook으로 Agent 결과를 SessionStart에 주입 (전역 CLAUDE.md "additionalContext는 짧고 무시 가능한 것만")
- ❌ 격리 룰 위반: 동일 파일(예: parsers.js) 다른 함수라도 동시 Agent 수정 — rebase/conflict 비용 > 순차 비용
- ❌ worktree 안 쓰고 한 브랜치에서 Track A·B 섞기 — 충돌 = 메인 개입 = 토큰 폭증

### 7.4 검증 단계

이 패턴은 **Round 0~1 1~2 spec 실제 돌려보기 전엔 일반화 금지** (전역 CLAUDE.md "자동화 전 수동 선행"). Round 0·1 후 잘 동작하면 프로젝트 auto memory에 feedback 기록, 다른 프로젝트에서도 통하면 mydb `rule` 등록 검토.

---

## 8. 본 문서 갱신 규칙

- 결정 완료된 `@user` 항목은 **이 문서에서 제거**하고 spec 본문에 결정사항 반영
- 새로 발견된 미결정·차단은 본 문서에 추가
- spec이 `shipped` 상태가 되면 해당 섹션을 본 문서에서 제거 (이력은 git log로 추적)
- 본 문서가 비어 가면 모든 신규 기능 작업이 끝났다는 신호

---

## 9. 변경 이력

- **2026-04-30~05-02 Round 1.5 머지 완료**: B-7/B-9/B-10 라이브 회귀 4건 + e2e 커버리지 보강 + B-8 headless 모드 timeout 해소. 6개 작업(12 commits) 모두 main 진입. ea9133e..344bf2f 범위. 문서 갱신: NEXT-SESSION §1 Round 1.5 통합 헤더, §4 B-7/9/10 제거(해소 완료), §5.4 "선결조건 모두 해소" 표기, §5.6 타임라인 Round 1.5 추가, §6 Round 2 진입 명확화, §7.2 격리 룰 신설, §7.3 안티패턴 추가, §9 통합 문단.
- 2026-04-28: 초기 인계 문서 작성. spec 01~10 draft 기준의 미결정 항목 모음.
- 2026-04-28: spec 01 결정 반영 — 새 탭 전용 페이지 진입(U-01-1), 시간축 08:00~24:00(U-01-2), 데이터 소스 = spec 05 `lectureSnapshot`(D-3). 작업 순서 05 → 01로 변경. spec 01·05 본문 동기화, 의존 그래프(§5)·권장 시퀀스(§6) 갱신.
- 2026-04-29: §2를 묶음 A~E 구조로 재편(차단성 🛑/⏸️/✅ 분류 추가), §5를 라운드 단위로 재배치(Round 0~3 + 의존성 그래프 + 타임라인 + 병렬 효율 룰 + 함정 포인트), §6 권장 시퀀스를 Round 0 진입 형태로 갱신, **§7 작업 모드 신설**(code-delegate + worktree 병렬, 토큰 절약 룰, 안티패턴), §8/§9 번호 시프트.
- 2026-04-29: 묶음 A 결정 완료 + **spec 07 폐기**. spec 04·06·07·08·09·10 본문 동기화.
- **2026-04-29 Round 0 머지 완료**: spec 05 핵심 경로 MVP(7 커밋, 55 테스트) + 비식별화 도구(`npm run refresh:fixtures`, 7 커밋, 24 테스트) 두 브랜치 main 머지. spec 05 `Status: shipped`. 묶음 D 일부 자동 해소(U-02-1·U-03-1 site-current fixture 분석으로 확정), B-1 부분 해소·B-2 정원 노출 확정. B-3 라이브 검증은 옵션 UI 후속 PR 시점으로 보류. 새 차단 항목 B-5(`content-scripts.test.js` 회귀) 추가. §1·§2(묶음 D·E)·§4(B-1·B-2·B-3·B-5)·§5(타임라인·라운드)·§6(권장 시퀀스 Round 1 진입) 갱신.
- **2026-04-29 Round 1 진입**: B-5 ✅ 머지(b812215, fixture 시각 영구 미래화). spec 01 본문 사용자 결정 반영해 통째 재작성 — 캘린더 본체를 lectureSnapshot 직접 렌더에서 **Google Calendar 이벤트만(`GET_CALENDAR_EVENTS` 메시지 재사용)** 으로 전환, **사이드 패널에 lectureSnapshot 기반 미신청 특강 + 빈 영역 드래그 시 완전 포함 필터** UX 도입. T-01 해소, 신규 메시지 없음, spec 02·03·04 필터 슬롯 인터페이스만 마련. §1(직전 세션)·§2(묶음 D Spec 01 결정 항목 갱신)·§3(T-01 해소·T-01a/b 신설)·§4(B-5 해소)·§5.3(Round 1 진행 표) 갱신.
- **2026-04-29 Round 1 머지 완료**: spec 01 calendar-view 11 commits → main 머지. coder(sonnet) 위임 → code-reviewer(sonnet) 사이클 → 5 fix(REV-1~5) 적용 → 108/108 pass. 신규 파일 9개(`src/calendar/*` 5개 + tests 2개 + mock 1개), 수정 4개(`manifest.json`, `service-worker.js`, `agent-guide.md` §3·§7, `01-calendar-view.md`). spec 01 `Status: shipped`. lecture-filter `additionalFilters` plug-in 슬롯이 spec 02·03·04 진입 시 시그니처 변경 없이 확장 가능. 라이브 환경 수동 검증은 사용자 백로그(B-3과 함께). §1·§5.3·§6(Round 2 진입 안내) 갱신.
- **2026-04-30 spec 12 (자동 E2E 테스트 환경) 신설 + shipped**: Playwright + Chromium persistent context 기반. 5개 시나리오(B-1~B-4 + C polling) 자동 검증. `npm run test:e2e` 9.1초에 6/8 통과. 인프라가 spec 01 회귀 2건(GET_CALENDAR_EVENTS 응답 형식·`tabs` permission 누락) 자동 발견, B-7로 신설 차단. 신규 파일: `tests/e2e/{playwright.config.js,helpers/*,fixtures/*,pages/*,scenarios/*,AUTHORING.md}`, `.github/workflows/test.yml`, `docs/specs/12-test-automation.md`. 수정: `package.json` (devDep `@playwright/test`, scripts `test:e2e/test:e2e:install/test:all`), `CLAUDE.md` (명령어·실행 환경 섹션), `docs/specs/README.md` (도구 트랙 표 추가). src/·mock/·tests/unit/· tests/fixtures/site-current 미변경. §1·§2·§4(B-7 신설)·§3(T-12-1~3 신규 미해결) 갱신.
- **2026-04-30 차단 작업 2건 분리 문서화**: B-7(spec 01 회귀)·B-8(E2E HEADLESS=1 SW timeout) 두 task를 다음 세션에서 cold start로 진입 가능하도록 별도 troubleshooting 문서 신설 — `docs/agent-troubleshooting/task-b7-spec01-regression.md`, `task-b8-e2e-headless.md`. 각 문서는 원인·수정 방침·검증·커밋 분할·**다음 세션 진입 프롬프트**를 포함. NEXT-SESSION §4 B-7 본문 축약(상세는 link)·B-8 신규 entry 추가. Bash 환경(headless='new')에서 직접 검증한 결과: 헤드풀 6/8 pass 정상, HEADLESS=1 6/6 fail (사용자 환경 검증 결과와 일치, B-7 차단 시나리오 2개는 헤드풀에서도 의도적 skip 유지).
- **2026-04-30 묶음 B+C 결정 5개 완료**: 백로그 단계 1. recommender(sonnet) 백그라운드 추천 + general-purpose(sonnet) 라이브 검증 자동 점검 6/6 ✅. AskUserQuestion 2회로 사용자 결정 수집 — 5개 모두 추천 채택 (U-08-1 A·U-09-1 C·U-10-2 B·U-02-2 A·U-04-2 B). spec 02·04·08·09·10 §3·§12 결정 반영, **spec 11 (자유 텍스트 검색) stub 신설**, README Phase 인덱스에 spec 11 추가 + spec 01·05 shipped 표기. §2 묶음 B·C 결정 완료 항목으로 이동. Round 2 진입 시 spec 코딩 차단 결정 모두 해소.
- **2026-04-30 B-7 fix 완료**: 3 commits(a3e15ae·86617c1·1675f1c), e2e 8/8 pass·단위 117/117 pass. `fix/spec-01-regressions` 브랜치에서 main 진입 예정. §1·§4(B-7 ✅ 마킹) 갱신.
